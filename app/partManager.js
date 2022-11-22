/**
 * @author Cameron McKay
 * 
 * @email cameron@webnx.com
 * 
 * @brief Part manager object for querying database and creating responses
 * 
 */
const part = require("../model/part");
const Part = require("../model/part");
const PartRecord = require("../model/partRecord")

const partManager = {
    // Create
    createPart: async (req, res) => {
        // Get part info from request body
        const { nxid, manufacturer, name, type, building, location } = req.body.part;
        // If any part info is missing, return invalid request
        if (!(nxid, manufacturer, name, type)) {
            return res.status(400).send("Invalid request");
        }
        // Try to add part to database
        /**
         * @TODO Add part validation logic
         */
        // Send part to database
        req.body.part.created_by = req.user.user_id;
        await Part.create(req.body.part, (err, part) => {
            if (err) {
                // Return and send error to client side for prompt
                return res.status(500).send("API could not handle your request: " + err);
            }
            for (let i = 0; i < req.body.part.quantitity; i++) {
                // Create part records to match the quantity and location of the part schema creation
                PartRecord.create({
                    nxid: part.nxid, 
                    building: building ? building : req.user.building,
                    location: location ? location : "Parts Room", 
                    by: req.user.user_id 
                })
            }
            // Succesful query
            return res.status(200).send(`Created part: ${part.manufacturer} ${part.name}`);
        });
    },
    // Read
    getPart: async (req, res) => {
        try {
            parts = await Part.find(req.query);
            // Query the database
            parts.quantity = await PartRecord.count({
                nxid: req.query.nxid, 
                next: null, 
                location: req.query.location ? req.query.location : "Parts Room", 
                building: req.query.building ? req.query.buiding : req.user.building
            })
            res.status(200).json(parts);
        } catch (err) {
            // Database error
            res.status(500).send("API could not handle your request: " + err);
        }
    },
    getPartByID: async (req, res) => {
        try {
            // Check if NXID
            if (/WNX([0-9]{7})+/.test(req.query.id)) {
                part = await Part.findOne({ nxid: { $eq: req.query.id } });
            }
            // If mongo ID
            else {
                part = await Part.findById(req.query.id)
            }
            // Get the total quantity
            part.total_quantity = await PartRecord.count({
                nxid: part.nxid, 
                next: null 
            });
            // Get available quantity in specified building or location - use defaults from ternary if unspecified
            part.quantitity = await PartRecord.count({ 
                nxid: part.nxid, 
                building: req.query.building ? req.query.building : req.user.building, 
                location: req.query.location ? req.query.location : "Parts Room", 
                next: null 
            });
            res.status(200).json(part);
        } catch (err) {
            // Database error
            res.status(500).send("API could not handle your request: " + err);
        }
    },
    checkout: async (req, res) => {
        try {
            // Find each item and check quantities before updating
            for (item of req.body.cart) {
                // Check quantity before
                let { quantity } = await PartRecord.count({ 
                    nxid: item.nxid, 
                    location: "Parts Room", 
                    building: item.building, 
                    next: null 
                });
                // Insufficient stock
                if (quantity < item.quantity) {
                    return res.status(400).send("Insufficient stock.")
                }
            }
            // Loop through each item and create new parts record and update old parts record
            for (item of req.body.cart) {
                // Find all matching part records to minimize requests and ensure updates don't conflict when using async part updating
                let records = await PartRecord.find({ 
                    nxid: item.nxid, 
                    location: "Parts Room", 
                    building: item.building, 
                    next: null 
                });
                // Loop for quanity of part item
                for (let j = 0; j < item.quantity; j++) {
                    // Create new iteration
                    PartRecord.create({ 
                        nxid: item.nxid, 
                        owner: req.user.user_id, 
                        prev: item._id, 
                        next: null 
                    }, (err, part) => {
                        if (err) {
                            // Error
                            return res.status(500).send("API could not handle your request: " + err);
                        }
                        // Set next value on old iteration to new part record
                        PartRecord.findByIdAndUpdate(records[j]._id, { next: part._id });
                    });
                }
            }
            // Success
            res.status(200).send("Successfully checked out.")
        }
        catch (err) {
            // Error
            res.status(500).send("API could not handle your request: " + err);
        }
    },
    checkin: async (req, res) => {
        try {
            /**
             * @TODO check quantities before starting record updates
             */
            // Find each item 
            for (item of req.body.inventory) {
                // Get database quantity
                const records = await PartRecord.find({
                    nxid: item.nxid,
                    next: null,
                    owner: req.user.user_id
                });
                for (let i = 0; i < item.quantitity; i++) {
                    // Create new part record - set prev to old record
                    PartRecord.create({
                        nxid: item.nxid,
                        next: null,
                        prev: records[i]._id,
                        location: "Parts Room",
                        building: req.user.building,
                        by: req.user.user_id
                    }, (err, part) => {
                        if (err) {
                            return res.status(500).send("API could not handle your request: "+err);
                        }
                        // Update old part record
                        ParteRecord.findByIdAndUpdate(records[i]._id, {
                            next: part._id
                        });
                    });
                }
            }
            // Success
            res.status(200).send("Successfully checked in.")
        }
        catch (err) {
            // Error
            res.status(500).send("API could not handle your request: " + err);
        }
    },
    getQuantitiesForSearch: async (req, res) => {
        /**
         * @TODO add location parameter to requests
         */
        try {
            // Get array of NXIDs
            const { parts, location, building } = req.body;
            // Create an array for quanties
            let quantities = [];
            // loop through each NXID
            for (const nxid of parts) {
                // Count number of matching part records
                let count = await PartRecord.count({
                    nxid, 
                    next: null, 
                    location: location ? location : "Parts Room",
                    building: building ? building : req.user.building
                    // location: 
                });
                // add to array in order
                quantities.push(count)
            }
            // send quantities
            res.status(200).json(quantities);
        } catch (err) {
            // Error
            res.status(500).send("API could not handle your request: " + err);
        }
    },
    searchParts: async (req, res) => {
        // Search data
        // Limit
        // Page number
        const { searchString, pageSize, pageNum } = req.query;
        // Find parts
        // Skip - gets requested page number
        // Limit - returns only enough elements to fill page

        // Splice keywords from search string
        let i = 0
        let keywords = []
        let spliced = false
        while (!spliced) {
            // If end of string
            if (searchString.indexOf(" ", i) == -1) {
                keywords.push(searchString.substring(i, searchString.length))
                spliced = true
            } else {
                // Add spliced keyword to keyword array
                keywords.push(searchString.substring(i, searchString.indexOf(" ", i)))
                i = searchString.indexOf(" ", i) + 1
            }
        }
        // Use keywords to build search options
        let searchOptions = []
        // Add regex of keywords to all search options
        for (const key of keywords) {
            searchOptions.push({ "name": { $regex: key, $options: "is" } })
            searchOptions.push({ "manufacturer": { $regex: key, $options: "is" } })
            searchOptions.push({ "type": { $regex: key, $options: "is" } })
            searchOptions.push({ "location": { $regex: key, $options: "is" } })
            searchOptions.push({ "storage_interface": { $regex: key, $options: "is" } })
            searchOptions.push({ "port_type": { $regex: key, $options: "is" } })
            searchOptions.push({ "peripheral_type": { $regex: key, $options: "is" } })
            searchOptions.push({ "memory_type": { $regex: key, $options: "is" } })
            searchOptions.push({ "cable_end1": { $regex: key, $options: "is" } })
            searchOptions.push({ "cable_end2": { $regex: key, $options: "is" } })
            searchOptions.push({ "chipset": { $regex: key, $options: "is" } })
        }
        Part.aggregate([{ $match: { $or: searchOptions } }])
            .skip(pageSize * (pageNum - 1))
            .limit(Number(pageSize))
            .exec((err, parts) => {
                if (err) {
                    // Database err
                    return res.status(500).send("API could not handle your request: " + err);
                }
                // Get rid of mongoose garbage
                // Send back to client
                return res.status(200).json(parts);
            })
    },
    // Update
    updatePartInfo: async (req, res) => {
        try {
            // Find part
            const { part } = req.body
            // Updated part is the old part from database
            let updatedPart = await Part.findByIdAndUpdate(part._id, part);
            if (!updatedPart) {
                return res.status(400).send("Part not found.");    
            }
            if(part.nxid != updatedPart.nxid) {
                // Update old NXID to new NXID
                PartRecord.find({nxid: updatedPart.nxid},
                    (err, parts) => {
                        if(err) {
                            return res.status(500).send("API could not handle your request: " + err);
                        }
                        // Change every part record
                        for (const part of parts) {
                            PartRecord.findByIdAndUpdate(part._id, {
                                nxid: updatedPart.nxid
                            });
                        }
                    }
                )
            }
            return res.status(201).send(`Updated part: ${updatedPart.manufacturer} ${updatedPart.name}`);
        } catch (err) {
            // Database error
            return res.status(500).send("API could not handle your request: " + err);
        }
    },
    addToInventory: async (req, res) => {
        try {
            // Get info from request
            const { nxid, quantity, location, building } = req.body.parts;
            // If any part info is missing, return invalid request
            if (!(nxid && quantity && location && buiding)) {
                return res.status(400).send("Invalid request");
            }
            // Try to add part to database
            /**
             * @TODO Add part validation logic
            */
            // Send part to database
            req.body.part.created_by = req.user.user_id;
            for (let i = 0; i < quantity; i++) {
                // Create new parts records to match the quantity
                PartRecord.create({ 
                    nxid,
                    location: location ? location : "Parts Room",
                    building: building ? building : req.user.building, 
                    prev: null, 
                    next: null
                });
            }
            // Success
            res.status(200).send("Successfully added to inventory")
        } catch (err) {
            // Error
            res.status(500).send("API could not handle your request: " + err);
        }
    },
    deletePart: async (req, res) => {
        try {
            // Try to find and delete by ID
            nxid = req.body.part.nxid;
            // Delete info
            part = await Part.findByIdAndDelete(req.body.part.id);
            // Find all associated parts records
            PartRecord.find({
                nxid
            }, (err, parts) => {
                if (err) {
                    // Error - don't return so other records will be deleted
                    res.status(500).send("API could not handle your request: " + err);
                }
                // Delete every part record
                for(const part of parts) {
                    PartRecord.findByIdAndDelete(part._id)
                }
            })
            // Success
            res.status(200).json("Successfully deleted part and records");
        } catch (err) {
            // Error
            res.status(500).send("API could not handle your request: " + err);
        }
    },
};
module.exports = partManager;