import {context} from '../context.js';
import {
    CoordinatorRpc,
    createCoordinatorApi,
} from '../coordinator/coordinator-api.js';
import {createReadApi} from '../data/read-api.js';
import {createWriteApi} from '../data/write-api/write-api.js';
import {tracerManager} from '../tracer-manager.js';
import {Message} from '../transport/message.js';
import {PersistentConnection} from '../transport/persistent-connection.js';
import {
    createApi,
    createRpcClient,
    InferRpcClient,
    InferRpcClientWithRequiredHeaders,
    MapProcessorState,
    RequestInfo,
} from '../transport/rpc.js';
import {Connection, TransportClient} from '../transport/transport.js';
import {assertNever} from '../utils.js';

export class ParticipantState {
    private readonly connection: Connection<Message>;

    public readonly coordinator: CoordinatorRpc;

    constructor(transport: TransportClient<Message>) {
        this.connection = new PersistentConnection(transport);
        this.coordinator = createRpcClient(
            createCoordinatorApi(),
            this.connection,
            () => ({
                ...context().extract(),
            }),
            'server',
            tracerManager.get('part')
        );
    }

    public get read(): InferRpcClientWithRequiredHeaders<
        ReturnType<typeof createReadApi>
    > {
        return this.coordinator;
    }

    public get write(): InferRpcClientWithRequiredHeaders<
        ReturnType<typeof createWriteApi>
    > {
        return this.coordinator;
    }

    close(): void {
        this.connection.close();
    }
}

export function createParticipantApi() {
    const coordinatorApi = createCoordinatorApi();

    function proxy<K extends keyof typeof coordinatorApi>(
        name: K
    ): MapProcessorState<(typeof coordinatorApi)[K], ParticipantState> {
        const processor = coordinatorApi[name];
        if (processor.type === 'handler') {
            return {
                type: 'handler',
                req: processor.req,
                res: processor.res,
                handle: (state: any, req: any, {headers}: RequestInfo) => {
                    return state.coordinator[name](req, headers);
                },
            } as any;
        } else if (processor.type === 'streamer') {
            return {
                type: 'streamer',
                req: processor.req,
                item: processor.item,
                stream: (state: any, req: any, {headers}: RequestInfo) => {
                    return state.coordinator[name](req, headers);
                },
            } as any;
        } else {
            assertNever(processor);
        }
    }

    return createApi<ParticipantState>()({
        streamPut: proxy('streamPut'),
        getStream: proxy('getStream'),
        debug: proxy('debug'),
        getMe: proxy('getMe'),
        sendSignInEmail: proxy('sendSignInEmail'),
        createBoard: proxy('createBoard'),
        verifySignInCode: proxy('verifySignInCode'),
        getDbTree: proxy('getDbTree'),
        getDbItem: proxy('getDbItem'),
        truncateDb: proxy('truncateDb'),
        deleteDbItem: proxy('deleteDbItem'),
        getMyBoards: proxy('getMyBoards'),
        echo: proxy('echo'),
        getBoard: proxy('getBoard'),
        createColumn: proxy('createColumn'),
        createTask: proxy('createTask'),
        getBoardView: proxy('getBoardView'),
        deleteBoard: proxy('deleteBoard'),
        deleteColumn: proxy('deleteColumn'),
        deleteTask: proxy('deleteTask'),
        setTaskTitle: proxy('setTaskTitle'),
        setTaskColumnId: proxy('setTaskColumnId'),
        setColumnTitle: proxy('setColumnTitle'),
        setBoardName: proxy('setBoardName'),
        createComment: proxy('createComment'),
        deleteComment: proxy('deleteComment'),
        getTaskComments: proxy('getTaskComments'),
        createMember: proxy('createMember'),
        deleteMember: proxy('deleteMember'),
        getBoardMembers: proxy('getBoardMembers'),
        setUserFullName: proxy('setUserFullName'),
        applyBoardDiff: proxy('applyBoardDiff'),
    });
}

export type ParticipantRpc = InferRpcClient<
    ReturnType<typeof createParticipantApi>
>;
