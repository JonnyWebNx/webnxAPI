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
        try{
            // Send part to database
            Part.create({nxid, manufacturer, name, attributes});
            // Success
            return res.status(200).send("Created part\t");
        }catch(error){
            // Return and send error to client side for prompt
            return res.status(500).send("Could not add part to database: "+err);
        }
        
    },
    // Read
    getPart: async (req, res)  => {
        console.log(req.params);
        return res.status(201).send("Got part\t" + req.query.name);
    },
    // Update
    updatePart: async (req, res)  => {
        return res.status(201).send("Updated part\t" + req.params);    
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
        try{
            // Try to find and delete by ID
            Part.findByIdAndDelete(req.body.part_id);
            return res.status(200).send("Deleted part\t" + req.url);
        } catch(err)
        {
            // Return and send error to client side for prompt.
            return res.status(400).send("Bad request: "+err);
        }
    },
};
module.exports = partManager;