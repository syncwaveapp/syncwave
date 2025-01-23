import {z} from 'zod';
import {
    AUTH_ACTIVITY_WINDOW_ALLOWED_ACTIONS_COUNT,
    AUTH_ACTIVITY_WINDOW_HOURS,
} from '../constants.js';
import {Uint8KVStore} from '../kv/kv-store.js';
import {addHours, getNow} from '../timestamp.js';
import {whenAll} from '../utils.js';
import {zUuid} from '../uuid.js';
import {Actor, DataAccessor} from './actor.js';
import {AuthContext, AuthContextParser} from './auth-context.js';
import {Message} from './communication/message.js';
import {createApi, handler, setupRpcServer} from './communication/rpc.js';
import {Connection, TransportServer} from './communication/transport.js';
import {DataLayer, TransactionContext} from './data-layer.js';
import {CryptoService, EmailService, JwtService} from './infra.js';
import {BoardId} from './repos/board-repo.js';
import {
    Identity,
    VerificationCode,
    createIdentityId,
} from './repos/identity-repo.js';
import {TaskId} from './repos/task-repo.js';
import {UserId, createUserId} from './repos/user-repo.js';

export class Coordinator {
    private readonly dataLayer: DataLayer;

    constructor(
        private readonly transport: TransportServer<Message>,
        kv: Uint8KVStore,
        private readonly jwt: JwtService,
        private readonly crypto: CryptoService,
        private readonly email: EmailService,
        private readonly jwtSecret: string
    ) {
        this.dataLayer = new DataLayer(kv, jwtSecret);
    }

    async launch(): Promise<void> {
        await this.transport.launch(conn => this.handleConnection(conn));
    }

    close() {
        this.transport.close();
    }

    async issueJwtByUserEmail(email: string): Promise<string> {
        return await this.dataLayer.transaction(async ctx => {
            let identity = await ctx.identities.getByEmail(email);
            if (!identity) {
                const userId = createUserId();
                const now = getNow();
                identity = {
                    id: createIdentityId(),
                    createdAt: now,
                    email,
                    updatedAt: now,
                    userId,
                    verificationCode: await createVerificationCode(this.crypto),
                    authActivityLog: [],
                };
                await ctx.identities.create(identity);
            }

            return signJwtToken(this.jwt, identity, this.jwtSecret);
        });
    }

    private handleConnection(conn: Connection<Message>): void {
        const authContextParser = new AuthContextParser(4, this.jwt);
        setupRpcServer(conn, createCoordinatorApi, async (message, fn) => {
            let effects: Array<() => Promise<void>> = [];
            const result = await this.dataLayer.transaction(async ctx => {
                effects = [];
                const auth = await authContextParser.parse(
                    ctx,
                    message.headers?.auth
                );
                return await fn({
                    ctx,
                    auth,
                    jwt: this.jwt,
                    crypto: this.crypto,
                    emailService: this.email,
                    enqueueEffect: effect => effects.push(effect),
                });
            });
            await whenAll(effects.map(effect => effect()));
            return result;
        });
    }
}

export interface BaseVerifySignInCodeResponse<TType extends string> {
    readonly type: TType;
}

export interface SuccessVerifySignInCodeResponse
    extends BaseVerifySignInCodeResponse<'success'> {
    readonly token: string;
}

export interface InvalidCodeVerifySignInCodeResponse
    extends BaseVerifySignInCodeResponse<'invalid_code'> {}

export interface CodeExpiredVerifySignInCodeResponse
    extends BaseVerifySignInCodeResponse<'code_expired'> {}

export interface CooldownVerifySignInCodeResponse
    extends BaseVerifySignInCodeResponse<'cooldown'> {}

export type VerifySignInCodeResponse =
    | SuccessVerifySignInCodeResponse
    | InvalidCodeVerifySignInCodeResponse
    | CodeExpiredVerifySignInCodeResponse
    | CooldownVerifySignInCodeResponse;

function createCoordinatorApi({
    ctx,
    auth,
    jwt,
    crypto,
    emailService,
    enqueueEffect,
}: {
    ctx: TransactionContext;
    auth: AuthContext;
    jwt: JwtService;
    crypto: CryptoService;
    emailService: EmailService;
    enqueueEffect: (cb: () => Promise<void>) => void;
}) {
    const actor: Actor = new Actor(ctx.txn, auth, {type: 'coordinator'});

    const dbApi = createApi({
        getMe: handler({
            schema: z.object({}),
            handle: actor.getMe.bind(actor),
        }),
        getMyBoards: handler({
            schema: z.object({}),
            handle: actor.getMyBoards.bind(actor),
        }),
        getBoardTasks: handler({
            schema: z.object({boardId: zUuid<BoardId>()}),
            handle: actor.getBoardTasks.bind(actor),
        }),
        getTask: handler({
            schema: z.object({taskId: zUuid<TaskId>()}),
            handle: actor.getTask.bind(actor),
        }),
        createTask: handler({
            schema: z.object({
                taskId: zUuid<TaskId>(),
                boardId: zUuid<BoardId>(),
                title: z.string(),
            }),
            handle: actor.createTask.bind(actor),
        }),
        createBoard: handler({
            schema: z.object({
                boardId: zUuid<BoardId>(),
                name: z.string(),
                slug: z.string().optional(),
            }),
            handle: actor.createBoard.bind(actor),
        }),
        getBoard: handler({
            schema: z.object({
                boardId: zUuid<BoardId>(),
            }),
            handle: actor.getBoard.bind(actor),
        }),
        setBoardSlug: handler({
            schema: z.object({
                boardId: zUuid<BoardId>(),
                slug: z.string(),
            }),
            handle: actor.setBoardSlug.bind(actor),
        }),
        updateBoardName: handler({
            schema: z.object({
                boardId: zUuid<BoardId>(),
                name: z.string(),
            }),
            handle: actor.updateBoardName.bind(actor),
        }),
        updateTaskTitle: handler({
            schema: z.object({
                taskId: zUuid<TaskId>(),
                title: z.string(),
            }),
            handle: actor.updateTaskTitle.bind(actor),
        }),
    } satisfies DataAccessor);

    async function needsCooldown(identity: Identity): Promise<boolean> {
        const cutoff = addHours(getNow(), -AUTH_ACTIVITY_WINDOW_HOURS);
        const actions = identity.authActivityLog.filter(x => x > cutoff);
        return actions.length >= AUTH_ACTIVITY_WINDOW_ALLOWED_ACTIONS_COUNT;
    }

    function pushActivityLog(x: Identity) {
        x.authActivityLog.push(getNow());
        if (
            x.authActivityLog.length >
            AUTH_ACTIVITY_WINDOW_ALLOWED_ACTIONS_COUNT
        ) {
            x.authActivityLog = x.authActivityLog.slice(
                -AUTH_ACTIVITY_WINDOW_ALLOWED_ACTIONS_COUNT
            );
        }
    }

    const authApi = createApi({
        debug: handler({
            schema: z.object({}),
            handle: async () => {
                return {};
            },
        }),
        sendSignInEmail: handler({
            schema: z.object({
                email: z.string(),
            }),
            handle: async ({
                email,
            }): Promise<{type: 'success'} | {type: 'cooldown'}> => {
                const verificationCode = await createVerificationCode(crypto);

                let identity = await ctx.identities.getByEmail(email);
                if (!identity) {
                    const now = getNow();
                    const userId = createUserId();

                    [identity] = await whenAll([
                        ctx.identities.create({
                            id: createIdentityId(),
                            createdAt: now,
                            updatedAt: now,
                            email,
                            userId,
                            verificationCode,
                            authActivityLog: [],
                        }),
                        ctx.users.create({
                            id: userId,
                            createdAt: now,
                            updatedAt: now,
                        }),
                    ]);
                }

                if (await needsCooldown(identity)) {
                    return {type: 'cooldown'};
                }

                await ctx.identities.update(identity.id, x => {
                    x.verificationCode = verificationCode;
                    pushActivityLog(x);
                });

                enqueueEffect(async () => {
                    await emailService.send({
                        recipient: email,
                        html: `<p>
                                    Hi there!<br />
                                    <br />
                                    We noticed a request to sign into your Ground account.<br />
                                    If this wasn't you, no worries—just ignore this email.<br />
                                    <br />
                                    Your one-time code is: <strong>${verificationCode.code}</strong><br />
                                    <br />
                                    Have a great day!<br />
                                    The Ground Team
                                </p>`,
                        subject: 'Your Ground Account Sign-In Code',
                        text: `Hi there!
                    
We noticed a request to sign into your Ground account. If this wasn't you, no worries—just ignore this email.

Your one-time code is: ${verificationCode.code}

Have a great day!
The Ground Team`,
                    });
                });

                return {type: 'success'};
            },
        }),
        verifySignInCode: handler({
            schema: z.object({
                email: z.string(),
                code: z.string(),
            }),
            handle: async ({
                email,
                code,
            }): Promise<VerifySignInCodeResponse> => {
                const identity = await ctx.identities.getByEmail(email);
                if (!identity) {
                    throw new Error('invalid email, no identity found');
                }

                if (await needsCooldown(identity)) {
                    return {type: 'cooldown'};
                }

                if (identity.verificationCode === undefined) {
                    throw new Error('verification code was not requested');
                }

                if (getNow() > identity.verificationCode.expires) {
                    return {type: 'code_expired'};
                }

                await ctx.identities.update(identity.id, x => {
                    pushActivityLog(x);
                });

                if (code !== identity.verificationCode.code) {
                    return {type: 'invalid_code'};
                }

                return {
                    type: 'success',
                    token: await signJwtToken(
                        jwt,
                        identity,
                        ctx.config.jwtSecret
                    ),
                };
            },
        }),
    });

    return {
        ...dbApi,
        ...authApi,
    };
}

interface JwtPayload {
    sub: string;
    exp: number;
    uid: UserId;
    iat: number;
}

async function signJwtToken(
    jwt: JwtService,
    identity: Identity,
    jwtSecret: string
) {
    const now = new Date();
    const exp = new Date(now.getTime());
    exp.setFullYear(exp.getFullYear() + 50);

    return await jwt.sign(
        {
            sub: identity.id.toString(),
            exp: Math.trunc(exp.getTime() / 1000),
            uid: identity.userId,
            iat: Math.trunc(now.getDate() / 1000),
        } satisfies JwtPayload,
        jwtSecret
    );
}

async function createVerificationCode(
    crypto: CryptoService
): Promise<VerificationCode> {
    const buf = await crypto.randomBytes(6);
    return {
        code: Array.from(buf)
            .map(x => x % 10)
            .join(''),
        // verification token expires after one hour
        expires: addHours(getNow(), 1),
    };
}

export type CoordinatorApi = ReturnType<typeof createCoordinatorApi>;
