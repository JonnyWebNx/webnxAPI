/**
 * @author Cameron McKay
 * 
 * @email cameron@webnx.com
 * 
 * @brief Basic driver file for starting the app and opening API_PORT for requests
 * 
 */

// import basic requirements
import http from 'http'
import app from './app.js'
import config from './config.js';
import PartRecord from './model/partRecord.js';
import Asset from './model/asset.js'
import { MongooseError } from 'mongoose';
import { PartRecordSchema, AssetSchema } from './app/interfaces.js';
import { LIB_VERSION } from './version.js';
import handleError from './config/handleError.js';

// Hand off requests to app
const server = http.createServer(app);

// Get port
const port = config.PORT;

// Open API_PORT for listening
server.listen(port, () => {
    console.log("\x1b[32m", "\x1b[1m",`\nWebNX API by Cameron McKay`,"\u001b[35m",`\nVersion ${LIB_VERSION}`,
    "\x1b[0m",`\nServer running on port ${config.PORT}`);
});

// PartRecord.find({owner: {$ne: undefined}}, async (err: MongooseError, res: PartRecordSchema[]) => {
//     if(err)
//         return
//     await Promise.all(res.filter((r)=>r.prev!=null).map((r, i)=>{
//         console.log("Record Num:" + (i+1))
//         return PartRecord.findByIdAndUpdate(r.prev, { next_owner: r.owner})
//     }))
//     console.log("Done")
// })
// 
// Asset.find({next: { $ne: null} }, async (err: MongooseError, res: AssetSchema[]) => {
//     if(err)
//         return
//     let count = 0
//     await Promise.all(res.filter((r)=>r.prev!=null&&r.date_replaced!=null).map((r)=>{
//         count++
//         return Asset.findByIdAndUpdate(r.next, { date_created: r.date_replaced })
//     }))
//     console.log("Assets updated: "+count)
//     console.log("Done")
// })
// 
// PartRecord.find({next: null}, async (err: MongooseError, res: PartRecordSchema[]) => {
//     let orphaned = 0
//     // For all records
//     await Promise.all(res.map((r)=>{
//         return new Promise<string>(async (res)=>{
//             // Set starting value
//             let current_record = r
//             // Check if prev is null
//             while(current_record.prev!=null) {
//                 // Find previous
//                 let temp = await PartRecord.findById(current_record.prev) as PartRecordSchema
//                 // Compare fields
//                 if(current_record._id!=temp?.next||current_record.prev!=temp?._id) {
//                     orphaned++
//                 }
//                 current_record = temp
//             }
//             // Resolve promise
//             res("")
//         })
//     }))
//     if(orphaned>0)
//         handleError("Orphaned records: "+orphaned)
// })
