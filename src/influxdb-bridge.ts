/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

import { Adapter, } from 'gateway-addon';
import { WebThingsClient, Device } from 'webthings-client';
import { client as WebSocketClient } from 'websocket';
import {InfluxDB, Point} from '@influxdata/influxdb-client';
import { Option, None} from 'space-lift'


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
        this.connectToinflux();
    }

    private async connectToinflux() {
        const {
            host,
            port,
            influxToken,
        } = this.manifest.moziot.config;

        const token:string = influxToken

        console.log(`Connecting to influx at ${host}`);

        const url = `http://${host}:${port}`;

        const influxDb = new InfluxDB({url, token}) 

        this.connectToGateway(influxDb);
    }

    private connectToGateway(influxDb: InfluxDB) {
        console.log('Connecting to gateway');

        const {
            accessToken,
            org,
            bucket
        } = this.manifest.moziot.config;

        (async () => {
            const webThingsClient = await WebThingsClient.local(accessToken);
            const devices: Device[] = await webThingsClient.getDevices();

            for (const device of devices) {
                try {
                    const parts = device.href.split('/');
                    const deviceId = parts[parts.length - 1];

                    console.log(`Connecting to websocket of ${deviceId}`);
                    const thingUrl = `ws://localhost:8080${device.href}`;
                    const webSocketClient = new WebSocketClient();

                    webSocketClient.on('connectFailed', function (error) {
                        console.error(`Could not connect to ${thingUrl}: ${error}`)
                    });

                    webSocketClient.on('connect', function (connection) {
                        console.log(`Connected to ${thingUrl}`);

                        connection.on('error', function (error) {
                            console.log(`Connection to ${thingUrl} failed: ${error}`);
                        });

                        connection.on('close', function () {
                            console.log(`Connection to ${thingUrl} closed`);
                        });

                        connection.on('message', async function (message) {
                            if (message.type === 'utf8' && message.utf8Data) {
                                const thingEvent = <ThingEvent>JSON.parse(message.utf8Data);

                                if (thingEvent.messageType === 'propertyStatus') {
                                    if (Object.keys(thingEvent.data).length > 0) {
                                        Object.keys(thingEvent.data).forEach( key => {
                                            
                                            const point = new PointFactory(key, deviceId)
                                                .getInfluxPoint(<ThingDataType>device.properties[key].type, (<any>thingEvent.data)[key])
                 
                                            point.forEach((p )=> {
                                                const writeApi = influxDb
                                                .getWriteApi(org, bucket);
                                                // console.log(`TEST: device: ${deviceId} prop: ${key}, val ${p}`);
                                                writeApi.writePoint(p);
                                                writeApi
                                                    .close()
                                                    .catch((e: any) => {
                                                        console.log('WRITE FAILED', e);
                                                    });   
                                            })
                                        });
                                    }
                                }
                            }
                        });
                    });

                    webSocketClient.connect(`${thingUrl}?jwt=${accessToken}`);
                } catch (e) {
                    console.log(`Could not process device ${device.title} ${e}`);
                }
            }
        })();
    }
}
