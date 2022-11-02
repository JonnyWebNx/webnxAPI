/**
 * @author Cameron McKay
 * 
 * @email cameron@webnx.com
 * 
 * @brief Part manager object for querying database and creating responses
 * 
 */
const Part = require("../model/part");

const partManager = {
    // Create
    createPart: async (req, res) => {
        // Get part info from request body
        console.log(req.user)
        const { nxid, manufacturer, name, type } = req.body.part;
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
            console.log(part);
            // Succesful query
            return res.status(200).send(`Created part: ${part.manufacturer} ${part.name}`);
        });
    },
    // Read
    getPart: async (req, res) => {
        try {
            parts = await Part.find(req.query);
            console.log(req.query)
            console.log(parts)
            // Query the database
            res.status(200).json(parts);
        } catch (err) {
            // Database error
            res.status(500).send("API could not handle your request: " + err);
        }
    },
    getPartByID: async (req, res) => {
        try {
            // Check if NXID
            if (/WNX([0-9]{7})+/.test(req.query.id)) 
            {
                parts = await Part.findOne({ nxid: { $eq: req.query.id } });
            }
            // If mongo ID
            else {
                parts = await Part.findById(req.query.id)
            }
            // Query the database
            res.status(200).json(parts);
        } catch (err) {
            // Database error
            res.status(500).send("API could not handle your request: " + err);
        }
    },
    checkout: async (req, res) => {
        try {
            // Find each item 
            let quantities = []
            for(item of req.body.cart) {
                // Get database quantity
                let { quantity } = await Part.findById(item.id);
                if (quantity < item.quantity) {
                    return res.status(400).send("Insufficient stock.")
                }
                quantities.push(quantity)
            }
            let i = 0
            for(item of req.body.cart) {
                // Get new quantity
                let newQuantity = quantities[i] - item.quantity;
                if(newQuantity < 0) {
                    newQuantity = 0
                }
                // Update
                await Part.findByIdAndUpdate(item.id, {quantity: newQuantity});
                i++;
            }
            // Success
            res.status(200).send("Successfully checked out.")
        }
        catch(err) {
            // Error
            res.status(500).send("API could not handle your request: "+err);
        }
    },
    checkin: async (req, res) => {
        try {
            // Find each item 
            for(item of req.body.cart) {
                // Get database quantity
                const { quantity } = await Part.findById(item.id);
                // Get new quantity
                let newQuantity = quantity + item.quantity;
                if(newQuantity < 0) {
                    newQuantity = 0
                }
                // Update
                await Part.findByIdAndUpdate(item.id, {quantity: newQuantity});
            }
            // Success
            res.status(200).send("Successfully checked in.")
        }
        catch(err) {
            // Error
            res.status(500).send("API could not handle your request: "+err);
        }
    },
    searchParts: async (req, res) => {
        // Search data
        // Limit
        // Page number
        console.log(req.query)
        const { searchString, pageSize, pageNum } = req.query;
        // Find parts
        // Skip - gets requested page number
        // Limit - returns only enough elements to fill page
        
        // Splice keywords from search string
        let i = 0
        let keywords = []
        let spliced = false
        while(!spliced){
            // If end of string
            if(searchString.indexOf(" ", i) == -1) {
                keywords.push(searchString.substring(i, searchString.legth))
                spliced = true
            }else {
                // Add spliced keyword to keyword array
                keywords.push(searchString.substring(i, searchString.indexOf(" ", i)))
                i = searchString.indexOf(" ", i) +1
            }
        }
        // Use keywords to build search options
        let searchOptions = []
        for (const key of keywords) {
            searchOptions.push({"name": { $regex: key, $options: "is"}})
            searchOptions.push({"manufacturer": { $regex: key, $options: "is"}})
            searchOptions.push({"type": { $regex: key, $options: "is"}})
            searchOptions.push({"location": { $regex: key, $options: "is"}})
            searchOptions.push({"storage_interface": { $regex: key, $options: "is"}})
            searchOptions.push({"port_type": { $regex: key, $options: "is"}})
            searchOptions.push({"peripheral_type": { $regex: key, $options: "is"}})
            searchOptions.push({"memory_type": { $regex: key, $options: "is"}})
            searchOptions.push({"cable_end1": { $regex: key, $options: "is"}})
            searchOptions.push({"cable_end2": { $regex: key, $options: "is"}})
            searchOptions.push({"chipset": { $regex: key, $options: "is"}})
        }
        console.log(keywords)

        Part.aggregate( [{$match:{$or: searchOptions}}])
            .skip(pageSize * (pageNum - 1))
            .limit(Number(pageSize))
            .exec((err, parts) => {
                if (err) {
                    // Database err
                    return res.status(500).send("API could not handle your request: " + err);
                }
                // Get rid of mongoose garbage
                // Send back to client
                console.log(parts)
                return res.status(200).json(parts);
            })
    },
    // Update
    updatePart: async (req, res) => {
        try {
            // Find part
            const { part } = req.body
            let updatedPart = await Part.findByIdAndUpdate(part._id, part);
            if (updatedPart) {
                console.log(part)
                return res.status(201).send(`Updated part: ${updatedPart.manufacturer} ${updatedPart.name}`);
            }
            // Null is falsey - Part not found
            res.status(400).send("Part not found.");
        } catch (err) {
            // Database error
            return res.status(500).send("API could not handle your request: " + err);
        }
    },
    // updateQuantity: async (req, res) => {
    //     try {
    //         const { id, quantity } = req.query;
    //         // Make sure id and quantify are in the request
    //         if (!(id && quantity)) {
    //             return res.status(400).send("Invalid request.");
    //         }
    //         // Find and update in database
    //         part = await Part.findByIdAndUpdate(id, { quantity });
    //         if (part) {
    //             // Part found
    //             return res.status.json(part);
    //         }
    //         // Part not part
    //         res.status(400).send("Part not found.");
    //     } catch (err) {
    //         // Database error
    //         res.status(500).send("API could not handle your request: " + err);
    //     }
    // },
    // Delete
    deletePart: async (req, res) => {
        try {
            // Try to find and delete by ID
            part = await Part.findByIdAndDelete(req.body.part.id);
            // Send copy back to user
            res.status(200).json(part);
        } catch (err) {
            res.status(500).send("API could not handle your request: " + err);
        }
    },
};
module.exports = partManager;