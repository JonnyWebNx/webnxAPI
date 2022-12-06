/**
 * @author Cameron McKay
 * 
 * @email cameron@webnx.com
 * 
 * @brief Part manager object for querying database and creating responses
 * 
 */
const Part = require("../model/part");
const PartRecord = require("../model/partRecord")

const partManager = {
    // Create
    createPart: async (req, res) => {
        try{

            // Get part info from request body
            const { nxid, manufacturer, name, type, quantity } = req.body.part;
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
            await Part.create(req.body.part, async (err, part) => {
                if (err) {
                    // Return and send error to client side for prompt
                    return res.status(500).send("API could not handle your request: " + err);
                }
                for (let i = 0; i < quantity; i++) {
                    // Create part records to match the quantity and location of the part schema creation
                    await PartRecord.create({
                        nxid: part.nxid, 
                        /**
                         * 
                         * @TODO Implement building on user object
                         * 
                         */
                        building: req.body.building ? req.body.building : 3,/*req.user.building,*/
                        location: req.body.location ? req.body.location : "Parts Room", 
                        by: req.user.user_id
                    }, (err, part) => {
                        if (err) {
                            console.log(err);
                        }
                    })
                }
                // Succesful query
                return res.status(200).send(`Created part: ${part.manufacturer} ${part.name}`);
            
            });
        } catch(err) {
            return res.status(500).send("API could not handle your request: " + err);
        }
    },
    // Read
    getPart: async (req, res) => {
        try {
            // Destructure request
            const { location, building } = req.query;
            const req_part = req.query.part;
            // Find parts that match request
            let parts = await Part.find(req_part);
            // Query the database
            console.log(parts)
            for (part of parts) {
                part = part._doc;
                // Count parts in given location or in parts room
                let count = await PartRecord.count({
                    nxid: part.nxid,
                    next: null, 
                    location: location ? location : "Parts Room",
                    building: building ? building : req.user.building
                });
                // Count total parts
                let total_count = await PartRecord.count({
                    nxid: part.nxid,
                    next: null
                });
                // Add quantities to part object
                part.quantity = count;
                part.total_quantity = total_count;
            }
            // return list of parts
            res.status(200).json(parts);
        } catch (err) {
            // Database error
            res.status(500).send("API could not handle your request: " + err);
        }
    },
    getPartByID: async (req, res) => {
        try {
            let part = {}
            // Check if NXID
            if (/WNX([0-9]{7})+/.test(req.query.id)) {
                part = await Part.findOne({ nxid: { $eq: req.query.id } });
            }
            // If mongo ID
            else {
                part = await Part.findById(req.query.id)
            }
            // Get the total quantity
            let total_quantity = await PartRecord.count({
                nxid: part.nxid, 
                next: null 
            });
            // Get available quantity in specified building or location - use defaults from ternary if unspecified
            let quantity = await PartRecord.count({ 
                nxid: part.nxid, 
                building: req.query.building ? req.query.building : req.user.building, 
                location: req.query.location ? req.query.location : "Parts Room", 
                next: null 
            });
            part = part._doc;
            part.total_quantity = total_quantity;
            part.quantity = quantity;
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
                console.log(item)
                let quantity = await PartRecord.count({ 
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
                        location: "Tech Inventory",
                        building: item.building,
                        by: req.user.user_id,
                        prev: records[j]._id,
                        next: null 
                    }, (err, part) => {
                        if (err) {
                            // Error
                            console.log("API could not handle your request: " + err);
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
            return res.status(500).send("API could not handle your request: " + err);
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
                    await PartRecord.create({
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
    searchParts: async (req, res) => {
        try {
            // Search data
            // Limit
            // Page number
            const { searchString, pageSize, pageNum, building, location } = req.query;
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
                .limit(Number(pageSize+1))
                .exec(async (err, parts) => {
                    if (err) {
                        // Database err
                        return res.status(500).send("API could not handle your request: " + err);
                    }
                    for (part of parts) {
                        let count = await PartRecord.count({
                            nxid: part.nxid, 
                            next: null, 
                            location: location ? location : "Parts Room",
                            building: building ? building : req.user.building
                        });
                        let total_count = await PartRecord.count({
                            nxid: part.nxid,
                            next: null
                        });
                        part.quantity = count;
                        part.total_quantity = total_count;
                    }
                    // Get rid of mongoose garbage
                    // Send back to client
                    return res.status(200).json(parts);
                })
        } catch (err) {
            return res.status(500).send("API could not handle your request: " + err);
        }
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
            const { nxid, quantity, location, building } = req.body.part;
            // If any part info is missing, return invalid request
            if (!(nxid && quantity && location && building)) {
                console.log(req.body.part)
                return res.status(400).send("Invalid request");
            }
            // Find part info
            Part.find({nxid}, (err, part)=> {
                if (err) {
                    return res.status(500).send("API could not handle your request: " + err);        
                }
                for (let i = 0; i < quantity; i++) {
                    // Create new parts records to match the quantity
                    PartRecord.create({ 
                        nxid,
                        location: location ? location : "Parts Room",
                        building: building ? building : req.user.building, 
                        prev: null, 
                        next: null,
                        by: req.user.user_id
                    });
                }
                // Success
                res.status(200).send("Successfully added to inventory")
            });
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
                    return res.status(500).send("API could not handle your request: " + err);
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
    getInventory: async (req, res) => {
        try {
            // Get user id
            const id = req.query.id ? req.query.id : req.user.user_id;
            // Query database
            PartRecord.find({
                owner: id,
                next: null
            }, (err, records) => {
                if (err) {
                    // Error
                    return res.status(500).send("API could not handle your request: " + err);
                }
                res.status(200).json(records);
            })
        } catch (err) {
            // Error
            res.status(500).send("API could not handle your request: " + err);
        }
    },
    getDistinctOnPartRecords: async (req, res) => {
        try {
            // Get key to find distinct values
            const { key } = req.query;
            // Find all distinct part records
            PartRecord.find().distinct(key, (err, values) => {
                if (err) {
                    // Error
                    return res.status(500).send("API could not handle your request: " + err);
                }
                // Send distinct values
                res.status(200).json(values);
            })
        } catch (err) {
            // Error
            res.status(500).send("API could not handle your request: " + err);
        }
    },
    getDistinctOnPartInfo: async (req, res) => {
        try {
            // Get key to find distinct values
            const { key } = req.query;
            // Find all distinct part records
            Part.find().distinct(key, (err, values) => {
                if (err) {
                    // Error
                    return res.status(500).send("API could not handle your request: " + err);
                }
                // Send distinct values
                res.status(200).json(values);
            })
        } catch (err) {
            // Error
            res.status(500).send("API could not handle your request: " + err);
        }
    }
};
module.exports = partManager;