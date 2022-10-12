/**
 * @author Cameron McKay
 * 
 * @email cameron@webnx.com
 * 
 * @brief Part manager object for querying database and creating responses
 * 
 */
const User = require("../model/user");
const Part = require("../model/part");

const partManager = {
    // Create
    createPart: async (req, res)  => {
        // Check database to see if user is admin
        var { admin } = await User.findById(req.user.user_id);
        // If they are not admin, return invalid permissions
        if (!admin){
            return res.status(401).send("Invalid permissions");
        }
        // Get part info from request body
        console.log(req.body);
        const { nxid, manufacturer, name, type, attributes } = req.body;
        // If any part info is missing, return invalid request
        if(!(nxid, manufacturer, name, type, attributes)){
            return res.status(400).send("Invalid request");
        }
        // Try to add part to database
        /**
         * @TODO Add part validation logic
         */
        // Send part to database
        await Part.create({nxid, manufacturer, name, attributes}, (err, part)=>{
            if(err){
                // Return and send error to client side for prompt
                return res.status(500).send("API could not handle your request: "+err);
            }
            // Succesful query
            return res.status(200).send(`Created part: ${part.manufacturer} ${part.name}`);
        });
    },
    // Read
    getPart: async (req, res)  => {
        // Query the database
        await Part.find(req.query, (err, parts) => {
            if(err){
                // Query failed
                return res.status(500).send("API could not handle your request: "+err);
            }
            // Query success
            return res.status(200).json(parts);
        });
    },
    // Update
    updatePart: async (req, res)  => {
        await Part.findByIdAndUpdate(req.query, (err, part) => {
            if(err){
                return res.status(500).send("API could not handle your request: "+err);
            }
            /**
             * 
             * @note STOPPED HERE
             * 
             * @todo fix query
             * 
             */
            return res.status(201).send(`Updated part: ${part.manufacturer} ${part.name}`);    
        })
    },
    // Delete
    deletePart: async (req, res) => {
        // Check database to see if user is admin
        var { admin } = await User.findById(req.user.user_id);
        // If user is not admin, return invalid permissions
        if (!admin){
            return res.status(401).send("Invalid permissions");
        }
        // Continue if user is admin
        // Try to find and delete by ID
        await Part.findByIdAndDelete(req.body.part_id, (err, part) => {
            if(err){
                // Fail to query database
                return res.status(500).send("API could not handle your request: ")
            }
            // Successful query
            return res.status(200).send(`Deleted part: ${part.manufacturer} ${part.name}`);
        });
    },
};
module.exports = partManager;