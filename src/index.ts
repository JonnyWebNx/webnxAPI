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
import Part from './model/part.js';
import mongoose, { MongooseError } from 'mongoose';
import { PartRecordSchema, PartSchema } from './app/interfaces.js';
import callbackHandler from './middleware/callbackHandlers.js';
import asset from './model/asset.js';
// Hand off requests to app
const server = http.createServer(app);

// Get port
const port = config.PORT;

// Open API_PORT for listening
server.listen(port, () => {
    console.log("\x1b[32m", "\x1b[1m",`                          
    ▄█     █▄     ▄████████ ▀█████████▄  ███▄▄▄▄   ▀████    ▐████▀ 
    ███     ███   ███    ███   ███    ███ ███▀▀▀██▄   ███▌   ████▀  
    ███     ███   ███    █▀    ███    ███ ███   ███    ███  ▐███    
    ███     ███  ▄███▄▄▄      ▄███▄▄▄██▀  ███   ███    ▀███▄███▀    
    ███     ███ ▀▀███▀▀▀     ▀▀███▀▀▀██▄  ███   ███    ████▀██▄     
    ███     ███   ███    █▄    ███    ██▄ ███   ███   ▐███  ▀███    
    ███ ▄█▄ ███   ███    ███   ███    ███ ███   ███  ▄███     ███▄  
     ▀███▀███▀    ██████████ ▄█████████▀   ▀█   █▀  ████       ███▄ 
                                            
                   ▄████████    ▄███████▄  ▄█   
                  ███    ███   ███    ███ ███   
                  ███    ███   ███    ███ ███▌ 
                  ███    ███   ███    ███ ███▌
                ▀███████████ ▀█████████▀  ███▌              
                  ███    ███   ███        ███     
                  ███    ███   ███        ███     
                  ███    █▀   ▄████▀      █▀   

WebNX API by Cameron McKay`,"\x1b[36m",`\nNow with Typescript!`,
"\x1b[0m",`\nServer running on port ${config.PORT}`);
});

PartRecord.find({}, async (err: MongooseError, records: PartRecordSchema[]) => {
  let handleCallbackError = (err: MongooseError, records: PartRecordSchema) => {
    if(err) {
      console.log(err)
      return
    }
  }
  let parts = await Part.find()
  let nxids = parts.map((part)=> part.nxid)
  let count = 0;
  let replaceCount = 0;
  for(let record of records) {
    if (!record.nxid||nxids.indexOf(record.nxid)==-1) {
      count++
      PartRecord.findByIdAndDelete(record._id, handleCallbackError)
    }
    if((record.date_replaced == null)&&(record.next!=null)&&(mongoose.Types.ObjectId.isValid(record.next))) {
      let nextRec = await PartRecord.findById(record.next)
      if (nextRec) {
        replaceCount++
        PartRecord.findByIdAndUpdate(record._id, { date_replaced: nextRec.date_created}, handleCallbackError)
      }
    }
    // Check for part records associated with non existent assets
    if(record.asset_tag) {
      let tempAsset = await asset.findOne({asset_tag: record.asset_tag})
      if(!tempAsset&&!record.next) {
        count++
        let tempRecord = record as PartRecordSchema
        count ++
        PartRecord.findByIdAndDelete(tempRecord._id, handleCallbackError)
        tempRecord = await PartRecord.findById(tempRecord.prev) as PartRecordSchema
        while((tempRecord!=null)&&(tempRecord.prev != null)) {
          count ++
          PartRecord.findByIdAndDelete(tempRecord._id, handleCallbackError)
          tempRecord = await PartRecord.findById(tempRecord.prev) as PartRecordSchema
        }
      }
    }
  }
  console.log("Orphaned records: "+count)
  console.log("Records updated: " +replaceCount)
})

asset.find({}, async (err: MongooseError, records: PartRecordSchema[]) => {
  let handleCallbackError = (err: MongooseError, records: PartRecordSchema) => {
    if(err) {
      console.log(err)
      return
    }
  }
  for (let record of records) {
    if(((record.date_replaced==undefined)||(record.date_replaced==null))&&(record.next!=null)) {
      let nextRec = await asset.findById(record.next)
      if (nextRec) {
        asset.findByIdAndUpdate(record._id, { date_replaced: nextRec.date_created }, handleCallbackError)
      }
    }
  }
})

