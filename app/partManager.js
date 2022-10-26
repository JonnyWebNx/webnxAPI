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
            if (req.query.id) {
                parts = await Part.findById(req.query.id)
            }
            else {
                console.log(req.query)
                parts = await Part.findOne({ nxid: { $eq: req.query.nxid } });
                console.log(parts)
            }
            // Query the database
            res.status(200).json(parts);
        } catch (err) {
            // Database error
            res.status(500).send("API could not handle your request: " + err);
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
        Part.find({ $text: { $search: searchString } })
            .skip(pageSize * (pageNum - 1))
            .limit(pageSize)
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
            console.log(req.query)
            var part = await Part.findByIdAndUpdate(req.query.id, req.query);
            if (part) {
                console.log(part)
                return res.status(201).send(`Updated part: ${part.manufacturer} ${part.name}`);
            }
            // Null is falsey - Part not found
            res.status(400).send("Part not found.");
        } catch (err) {
            // Database error
            return res.status(500).send("API could not handle your request: " + err);
        }
    },
    updateQuantity: async (req, res) => {
        try {
            const { id, quantity } = req.query;
            // Make sure id and quantify are in the request
            if (!(id && quantity)) {
                return res.status(400).send("Invalid request.");
            }
            // Find and update in database
            part = await Part.findByIdAndUpdate(id, { quantity });
            if (part) {
                // Part found
                return res.status.json(part);
            }
            // Part not part
            res.status(400).send("Part not found.");
        } catch (err) {
            // Database error
            res.status(500).send("API could not handle your request: " + err);
        }
    },
    // Delete
    deletePart: async (req, res) => {
        try {
            // Try to find and delete by ID
            part = await Part.findByIdAndDelete(req.query.id);
            // Send copy back to user
            res.status(200).json(part);
        } catch (err) {
            res.status(500).send("API could not handle your request: " + err);
        }
    },
};
module.exports = partManager;