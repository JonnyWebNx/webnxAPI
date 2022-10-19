/**
 * 
 * @author Cameron McKay
 * 
 * @email cameron@webnx.com
 * 
 * @brief Collection of functions for manipulating User entries in the database
 * 
 * 
 */
// Import user schema
const bcrypt = require("bcryptjs/dist/bcrypt");
const User = require("../model/user");

// Main object containing functions
const userManager = {
    // Create
    createUser: async (req, res) => {
        // Get required fields from request body
        var { first_name, last_name, email, password } = req.body;
        // Check if all required fields are filled
        if (!(first_name && last_name && email && password)){
            return res.status(400).send("Invalid request.")
        }
        // Check if email is already in use
        if (await User.findOne({ email })){
            return res.status(400).send("User already exists.");
        }
        // Encrypt user password
        encryptedPassword  = await bcrypt.hash(password, 10);
        // Send user data to database
        User.create({first_name, last_name, email, password: encryptedPassword}, (err, user) => {
            // If database insertion fails
            if(err){
                return res.status(500).send("API could not handle your request: "+err);
            }
            // If user creation is successful
            return res.status(200).send(`Created user: ${user.first_name} ${user.last_name}`);
        })
    },
    // Read
    getUser: async (req, res) => {
        const id = req.query.id || req.user.user_id;
        // Make sure query string has id
        if(id){
            try{
                // Find user in database
                var user = await User.findById(id);
                if(user){
                    // If user is found
                    // remove pasword from response
                    user = user._doc;
                    delete user.password;
                    // Send response
                    return res.status(200).json(user);
                }
                // If user is not found
                res.status(400).send("User not found."); 
            } catch(err) {
                // Database error
                return res.status(500).send("API could not handle your request: "+err);
            }
        }
        return res.status(400).send("Invalid request.");
    },
    getAllUsers: async (req, res) => {
        // check if user is admin
        const { admin } = req.user; 
        // Return if user is not admin
        if(!admin){
            return res.status(403).send("Invalid permissions");
        }
        try{
            // Get all users
            var users = await User.find();
            // Remove password from data
            for (const user of users){
                user = user._doc;
                delete user.password;
            }
            // Success
            return res.status(200).json(users);
        } catch(err) {
            // Database error
            return res.status(500).send("API could not handle your request: "+err);
        }
    },
    // Update - id required in query string
    updateUser: async (req, res) => {
        // Save user id from query string
        var { id } = req.query || req.user.user_id;
        const { admin, user_id } = req.user;
        if (!id){
           // Missing user id
           return res.status(400).send("Invalid request.");
        } else if((id != user_id)&&!admin){
            // User is trying to edit another user without permissions or 
            // a non admin user is trying to make themselves an admin.
            return res.status(403).send("Invalid permissions.");
        }
        // Check if email is available 
        try{
            // Check database to see if email already exists
            var emailExists = await User.findOne({email: req.body.email});
            if (emailExists&&id!=emailExists._id){
                console.log(emailExists);
                // Email already exists in database and does not belong to user
                return res.status(403).send("Email taken.")
            }
            // Delete password from request
            delete req.body.password;
            // Send update query to database
            var user = await User.findByIdAndUpdate(id, req.body)
            if(user){
                // User was found and updated
                return res.status(200).send(`Updated user: ${user.email}`);
            }
            // User was not found
            return res.status(400).send("User not found.");
        } catch(err) {
            // Database error
            return res.status(500).send("API could not handle your request: "+err);
        }
    },
    updatePassword: async (req, res) => {
        const { user_id } = req.user;
        // get password
        const { password } = req.body;
        try {
            if(!password){
                return res.status(400).send("Invalid request.");
            }
            const encryptedPassword = await bcrypt.hash(password, 10);
            const user = User.findByIdAndUpdate(user_id, { password: encryptedPassword });
            if(user){
                // remove password from response
                user = user._doc;
                delete user.password;
                return res.status(200).send(user);
            }
            return res.status(400).send("User not found");
        } catch(err) {
            return res.status(500).send("API could not handle your request: "+err);
        }
    },
    // Delete - id required in query string
    deleteUser: async (req, res) => {
        // Get user id from query string
        var userToDelete = req.query.id;
        // Send id to database for deletion
        User.findByIdAndDelete(userToDelete, (err, user) => {
            if(err){
                // Database encountered error
                return res.status(500).send("API could not handle your request: "+err);
            } else if(!user){
                // User was not found
                return res.status(400).send("User not found.");
            }
            // User was succesfully deleted
            return res.status(200).send(`Deleted: ${user.first_name} ${user.last_name}`);
        });
    }
}
module.exports = userManager;