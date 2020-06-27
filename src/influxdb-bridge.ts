/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

import { Adapter } from 'gateway-addon';
import { WebThingsClient, Device } from 'webthings-client';
import {Point} from '@influxdata/influxdb-client';
import { Option, None } from 'space-lift';
import { Persister, IPersister} from './persister-influx';
import { Client } from './ws-client';

const PROPERTY_STATUS = 'propertyStatus';

enum ThingDataType {
    BOOLEAN = "boolean",
    NUMBER = "number",
    INTEGER = "integer",
    STRING = "string",
}

class PointFactory {

    private name: string;
    private deviceId: string;
    
    constructor (name:string, deviceId:string){
        this.deviceId = deviceId;
        this.name = name;
    }

    public getInfluxPoint(type: ThingDataType, val: any): Option<Point>{
        switch(type) { 
            case ThingDataType.NUMBER: { 
                return Option(new Point(this.name)
                    .tag('device', this.deviceId)
                    .floatField('value', <number>val));               
            } 
            case ThingDataType.INTEGER: { 
                return Option(new Point(this.name)
                    .tag('device', this.deviceId)
                    .intField('value', <number>val));   
            } 
            case ThingDataType.BOOLEAN: { 
                return Option(new Point(this.name)
                    .tag('device', this.deviceId)
                    .booleanField('value', <boolean>val));   
                } 
            case ThingDataType.STRING: { 
                return Option(new Point(this.name)
                    .tag('device', this.deviceId)
                    .stringField('value', <string>val));   
            } 
            default: { 
                return None;  
            } 
         } 
    }
}


interface ThingEvent {
    messageType: string,
    data: {}
}


export class InfluxDBBridge extends Adapter {

    constructor(addonManager: any, private manifest: any) {
        super(addonManager, InfluxDBBridge.name, manifest.name);
        addonManager.addAdapter(this);
        this.saveAllDevices();
    }

    private async saveAllDevices() {
        const {
            accessToken,
            names,
            host,
            port,
            influxToken,
            bucket,
            org
        } = this.manifest.moziot.config;


        const url = `http://${host}:${port}`;

        const persister = new Persister(url,influxToken,org,bucket)
        
        const devices: Device[] = await this.getGatewayActiveThings(accessToken);

        let availableDevices = devices.filter(device => device.title in names)

        availableDevices.forEach((device: Device) => this.saveToInflux(persister,device));
    }

    private async getGatewayActiveThings(accessToken: string){
        console.log('Connecting to gateway');
        const webThingsClient = await WebThingsClient.local(accessToken);
        return await webThingsClient.getDevices();
    }

    private saveToInflux(persister:IPersister, device: Device) {
        const {
            accessToken
        } = this.manifest.moziot.config;

        try {
            const deviceId = device.title

            console.log(`Connecting to websocket of ${deviceId}`);
            const thingUrl = `ws://localhost:8080${device.href}`;
            // TODO: reduce params
            const webSocketClient = new Client(5000,`${thingUrl}?jwt=${accessToken}`);

            webSocketClient.on('connectFailed', function (error) {
                console.error(`Could not connect to ${thingUrl}: ${error}`)

            });

            webSocketClient.on('connect', function (connection) {
                console.log(`Connected to ${thingUrl}`);

                connection.on('error', function (error) {
                    switch (error.name){
                        case 'ECONNREFUSED':
                            console.error(`Try to rconnect to ${thingUrl}: ${error}`);
                            webSocketClient.reconnect(`${thingUrl}?jwt=${accessToken}`);
                            break;
                        default:
                            console.error(`Error connecting to ${thingUrl}: ${error}`)
                            break;
                        }
                    webSocketClient.reconnect(`${thingUrl}?jwt=${accessToken}`)                            });

                connection.on('close', function () {
                    console.log(`Connection to ${thingUrl} closed`);
                });

                connection.on('message', async function (message) {
                    if (message.type === 'utf8' && message.utf8Data) {
                        const thingEvent = <ThingEvent>JSON.parse(message.utf8Data);
                        if (thingEvent.messageType === PROPERTY_STATUS) {
                            Object.keys(thingEvent.data).forEach( key => {                                               
                                new PointFactory(key, deviceId)
                                .getInfluxPoint(<ThingDataType>device.properties[key].type, (<any>thingEvent.data)[key])
                                .forEach((p)=> {
                                    persister.writeData(p);
                                });
                            });                                      
                        }
                    }
                });
            
            });

            webSocketClient.connect(webSocketClient.clientUrl);
        } catch (e) {
            console.log(`Could not process device ${device.title} ${e}`);
        }
    }

    // private connectToGateway(persister: IPersister, savedDevice: string) {
    //     console.log('Connecting to gateway');
        
    //     const {
    //         accessToken,
    //     } = this.manifest.moziot.config;

    //     (async () => {
    //         const webThingsClient = await WebThingsClient.local(accessToken);
    //         const devices: Device[] = await webThingsClient.getDevices();
            
    //         devices.filter(device => device.title==savedDevice)
    //             .forEach(device => {
    //                 try {
    //                     const deviceId = device.title
    
    //                     console.log(`Connecting to websocket of ${deviceId}`);
    //                     const thingUrl = `ws://localhost:8080${device.href}`;
    //                     // TODO: reduce params
    //                     const webSocketClient = new Client(5000,`${thingUrl}?jwt=${accessToken}`);
    
    //                     webSocketClient.on('connectFailed', function (error) {
    //                         console.error(`Could not connect to ${thingUrl}: ${error}`)

    //                     });
    
    //                     webSocketClient.on('connect', function (connection) {
    //                         console.log(`Connected to ${thingUrl}`);
    
    //                         connection.on('error', function (error) {
    //                             switch (error.name){
    //                                 case 'ECONNREFUSED':
    //                                     console.error(`Try to rconnect to ${thingUrl}: ${error}`);
    //                                     webSocketClient.reconnect(`${thingUrl}?jwt=${accessToken}`);
    //                                     break;
    //                                 default:
    //                                     console.error(`Error connecting to ${thingUrl}: ${error}`)
    //                                     break;
    //                                 }
    //                             webSocketClient.reconnect(`${thingUrl}?jwt=${accessToken}`)                            });
    
    //                         connection.on('close', function () {
    //                             console.log(`Connection to ${thingUrl} closed`);
    //                         });
    
    //                         connection.on('message', async function (message) {
    //                             if (message.type === 'utf8' && message.utf8Data) {
    //                                 const thingEvent = <ThingEvent>JSON.parse(message.utf8Data);
    //                                 if (thingEvent.messageType === PROPERTY_STATUS) {
    //                                     Object.keys(thingEvent.data).forEach( key => {                                               
    //                                         new PointFactory(key, deviceId)
    //                                         .getInfluxPoint(<ThingDataType>device.properties[key].type, (<any>thingEvent.data)[key])
    //                                         .forEach((p)=> {
    //                                             persister.writeData(p);
    //                                         });
    //                                     });                                      
    //                                 }
    //                             }
    //                         });
                        
    //                     });
    
    //                     webSocketClient.connect(webSocketClient.clientUrl);
    //                 } catch (e) {
    //                     console.log(`Could not process device ${device.title} ${e}`);
    //                 }
    //             })
          
    //     })();
    // }


}
