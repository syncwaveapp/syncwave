import {
    Codec,
    Connection,
    ConnectionEvent,
    ConnectionSubscribeCallback,
    Deferred,
    Subject,
    TransportServer,
    Unsubscribe,
} from 'ground-data';
import {WebSocket, WebSocketServer} from 'ws';

export interface WsTransportServerOptions<T> {
    readonly port: number;
    readonly codec: Codec<T>;
}

export class WsTransportServer<T> implements TransportServer<T> {
    private wss: WebSocketServer | undefined;

    constructor(private readonly options: WsTransportServerOptions<T>) {}

    launch(cb: (connection: Connection<T>) => void): Promise<void> {
        this.wss = new WebSocketServer({port: this.options.port});

        const listening = new Deferred<void>();

        this.wss.on('connection', (ws: WebSocket) => {
            const connection = new WsConnection<T>(ws, this.options.codec);
            cb(connection);
        });

        this.wss.on('listening', () => {
            listening.resolve();
        });

        return listening.promise;
    }

    close(): void {
        this.wss?.close();
    }
}

export class WsConnection<T> implements Connection<T> {
    private subject = new Subject<ConnectionEvent<T>>();

    constructor(
        private readonly ws: WebSocket,
        private readonly codec: Codec<T>
    ) {
        this.setupListeners();
    }

    async send(message: T): Promise<void> {
        return new Promise((resolve, reject) => {
            const data = this.codec.encode(message);
            this.ws.send(data, (err?: Error) => {
                if (err) {
                    return reject(err);
                }
                resolve();
            });
        });
    }

    subscribe(cb: ConnectionSubscribeCallback<T>): Unsubscribe {
        return this.subject.subscribe(cb);
    }

    async close(): Promise<void> {
        this.ws.close();
    }

    private setupListeners(): void {
        this.ws.on('message', (rawData: Buffer) => {
            let message: T;
            try {
                message = this.codec.decode(rawData);
            } catch (err) {
                console.error(err);
                return;
            }

            this.subject.next({type: 'message', message});
        });

        this.ws.on('close', () => {
            this.subject.next({type: 'close'});
        });
    }
}
