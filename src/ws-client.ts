import { client as WebSocketClient } from 'websocket';


export class Client extends WebSocketClient {

    private _url:string;

    constructor(
        private autoReconnectInterval: number,
        url:string,
        clientConfig?: any ) {
        super(clientConfig);
        this._url=url;
    }
    
    get clientUrl():string {
        return this._url;
    }
    public reconnect(e: any){
        console.log(`WebSocketClient: retry in ${this.autoReconnectInterval}ms`,e);
        var that = this;
        setTimeout(function(){
            console.log("WebSocketClient: reconnecting...");
            that.connect(that.url);
        },this.autoReconnectInterval);
    }
}
