import {Message} from '../communication/message.js';
import {Connection} from '../communication/transport.js';
import {createRpcClient} from '../rpc/rpc-engine.js';
import {CoordinatorRpc, createCoordinatorApi} from './coordinator-api.js';

export class CoordinatorClient {
    private token?: string;
    public readonly rpc: CoordinatorRpc;

    constructor(private readonly connection: Connection<Message>) {
        this.rpc = createRpcClient(
            createCoordinatorApi(),
            this.connection,
            () => ({auth: this.token})
        );
    }

    authenticate(authToken: string) {
        this.token = authToken;
    }
}
