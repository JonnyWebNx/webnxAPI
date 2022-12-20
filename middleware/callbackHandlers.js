const handleError = require("../config/mailer")
const PartRecord = require("../model/partRecord");

const callbackHandler = {
    updateRecord: (err, record) => {
        if (err) {
            return handleError(err)
        }
        PartRecord.findByIdAndUpdate(record.prev, { next: record._id }, (err, record) => {
            if (err) {
                return handleError(err)
            }
        })
    },
    returnRecord: (err, record) => {
        if (err)
            res.status(500).send("API could not handle your request: " + err);
        else
            res.status(200).json(record);
    },
    callbackHandleError: (err, record) => {
        if (err) {
            return handleError(err)
        }
    }
}

module.exports = callbackHandler
