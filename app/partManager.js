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
        const { user_id, admin } = req.user;
        // If they are not admin, return invalid permissions
        if (!admin){
            return res.status(403).send("Invalid permissions");
        }
        // Get part info from request body
        console.log(req.body);
        const { nxid, manufacturer, name, type, attributes } = req.body;
        // If any part info is missing, return invalid request
        if(!(nxid, manufacturer, name, type)){
            return res.status(400).send("Invalid request");
        }
        // Try to add part to database
        /**
         * @TODO Add part validation logic
         */
        // Send part to database
        if(req.body.quantity){
            req.body.quantity = Number(req.body.quantity);
        }
        req.body.created_by = user_id;
        await Part.create(req.body, (err, part)=>{
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
        try{
            // Query the database
            parts = await Part.find(req.query);
            if(parts.length==0){
                return res.status(400).send("No parts found.")
            }
            res.status(200).json(parts);
        }catch(err){
            // Database error
            res.status(500).send("API could not handle your request: "+err)
        }
    },
    // Update
    updatePart: async (req, res)  => {
        // Check database to see if user is admin
        const { admin } = req.user;
        // Return if not admin
        if (!admin){
            return res.status(403).send("Invalid permissions");
        }
        try{
            // Find part
            var part = await Part.findById(req.query.id);
            if(part){
                return res.status(201).send(`Updated part: ${part.manufacturer} ${part.name}`);    
            }
            // Null is falsey - Part not found
            res.status(400).send("Part not found.");
        }catch(err){
            // Database error
            return res.status(500).send("API could not handle your request: "+err);
        }
    },
    updateQuantity: async (req, res) => {
        try{
            const { id, quantity } = req.query;
            // Make sure id and quantify are in the request
            if(!(id&&quantity)){
                return res.status(400).send("Invalid request.");
            }
            // Find and update in database
            part = await Part.findByIdAndUpdate(id,{quantity});
            if(part){
                // Part found
                return res.status.json(part);
            }
            // Part not part
            res.status(400).send("Part not found.");
        }catch(err){
            // Database error
            res.status(500).send("API could not handle your request: "+err);      
        }
    },
    // Delete
    deletePart: async (req, res) => {
        const { admin } = req.user;
        // If user is not admin, return invalid permissions
        if (!admin){
            return res.status(403).send("Invalid permissions");
        }
        try{
            // Continue if user is admin
            // Try to find and delete by ID
            part = await Part.findByIdAndDelete(req.query.id);
            // Send copy back to user
            res.status(200).json(part);
        } catch(err){
            res.status(500).send("API could not handle your request: "+err);
        }
    },
};
module.exports = partManager;