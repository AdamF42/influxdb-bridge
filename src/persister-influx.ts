
import {InfluxDB, Point, WriteApi} from '@influxdata/influxdb-client'

const {hostname} = require('os')


const VERBOSE_MODE: boolean = true;
const STATUS_OK: boolean = true;
const STATUS_ERROR: boolean =false;

export interface IPersister {
	writeData(point:Point):Promise<boolean>;
}

export class Persister implements IPersister{
	
	private influx: InfluxDB;

	constructor(url: string, 
		token:string, 
		private org:string, 
		private bucket:string) {
		this.influx  = new InfluxDB({url, token});
	}


	public async writeData(point:Point): Promise<boolean> {
		let status: boolean=STATUS_OK;
		const writeApi= this.influx.getWriteApi(this.org, this.bucket);
		writeApi.useDefaultTags({location: hostname()});

		status= await this.sendWriteCommand(writeApi, point);

		return status;
	}

	
	private async sendWriteCommand(writeApi: WriteApi, point: Point): Promise<boolean> {
		return new Promise<boolean>((resolve) => {
			let status: boolean;
			writeApi.writePoint(point);
			writeApi.close()
					.then(() => {
						status=STATUS_OK;
						if (VERBOSE_MODE)
							console.log('[WRITE COMPLETED] '+ point);
						resolve(status);
								})
					.catch(e => {
						status=STATUS_ERROR;
						if (VERBOSE_MODE)
								console.log('[WRITE ERROR]' + e);
						resolve(status);
					});
			
		});	
	}	
}