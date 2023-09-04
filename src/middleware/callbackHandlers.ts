import { CallbackError, MongooseError } from 'mongoose'
import handleError from '../config/handleError.js'
import PartRecord from '../model/partRecord.js'
import { PartRecordSchema, AssetSchema } from '../app/interfaces.js'
import Asset from '../model/asset.js'
import { Response } from 'express'

const callbackHandler = {
    updateRecord: (err: CallbackError, record: any) => {
        if (err) {
            return handleError(err)
        }
        PartRecord.findByIdAndUpdate(record.prev, { next: record._id, date_replaced: record.date_created, next_owner: record.owner }, (err: MongooseError, record: PartRecordSchema) => {
            if (err) {
                return handleError(err)
            }
        })
    },
    updateAsset: (err: CallbackError, record: any) => {
        if (err) {
            return handleError(err)
        }
        Asset.findByIdAndUpdate(record.prev, { next: record._id, date_replaced: record.date_created, next_pallet: record.pallet }, (err: MongooseError, record: PartRecordSchema) => {
            if (err) {
                return handleError(err)
            }
        })
    },
    updateAssetAndReturn: (res: Response) =>{
        return (err: CallbackError, record: any) => {
            if (err) {
                res.status(500).send("API could not handle your request: "+err);
                return handleError(err)
            }
            Asset.findByIdAndUpdate(record.prev, { next: record._id, date_replaced: record.date_created, next_pallet: record.pallet }, (err: MongooseError, record: PartRecordSchema) => {
                if (err) {
                    res.status(500).send("API could not handle your request: "+err);
                    return handleError(err)
                }
                res.status(200).send("Success")
            })
        }
    },
    callbackHandleError: (err: CallbackError, record: any) => {
        if (err) {
            return handleError(err)
        }
    }
}

export default callbackHandler
