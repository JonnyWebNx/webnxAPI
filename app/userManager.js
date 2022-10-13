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
const { findById } = require("../model/user");
const user = require("../model/user");
const User = require("../model/user");

// Main object containing functions
const userManager = {
    // Create
    createUser: async (req, res) => {
        // Check database to see if user is admin
        var { admin } = await User.findById(req.user.user_id);
        // If user is not admin, return invalid permissions
        if (!admin){
            return res.status(401).send("Invalid permissions");
        }
        // User is admin
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
        User.create({first_name, last_name, email, encryptedPassword}, (err, user) => {
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
        if(req.query.id){

        }

    },
    getAllUsers: async (req, res) => {
        isAdmin = await User.findById(req.user.id).admin;
        if(isAdmin){
            User.find((err, users)=>{
                if(err){
                    // Database error
                    return res.status(500).send("API could not handle your request: "+err);
                }
                // Remove password from data
                for (const user of users){
                    delete user.password;
                }
                // Success
                res.status(200).json(users);
            });
        }
        res.status(401).send("Invalid permissions");
    },
    // Update - id required in query string
    updateUser: async (req, res) => {
        // Save user id from query string
        var { user_id } = req.body;
        var isUserAdmin = await findById(req.user.user_id);
        if (!user_id){
            // Missing user id
        } else if((req.user.id != user_id)&&!req.user.admin||!req.user.admin&&admin){
            // User is trying to edit another user without permissions or 
            // a non admin user is trying to make themselves an admin.

        }
        // Check if email is available 
        var emailExists = await User.findOne({email: req.body.email});
        if (emailExists&&req.user.user_id!=emailExists.user_id){
            // Email already exists in database and does not belong to user

        }
        // Send update query to database
        User.findByIdAndUpdate(id, {first_name: req.body.first_name, last_name: req.body.last_name,
            admin: req.body.admin, email: req.body.email}, (err, user) => {
                if(err){
                    // Database error
                    return res.status(500).send("API could not handle your request: "+err);
                } else if(user){
                    // User was found and updated
                    return res.status(200).send(`Updated user: ${user.email}`);
                }
                // User was not found
                return res.status(400).send("User not found.");
            })

    },
    updatePassword: async (req, res) => {
        // get user id
        userToUpdate = req.body.user_id;

    },
    // Delete - id required in query string
    deleteUser: async (req, res) => {
        // Get user id from query string
        var userToDelete = req.query.id;
        // Check database to see if user is admin
        var { admin } = await User.findById(req.user.user_id);
        // If user is not admin, return invalid permissions
        if (!admin){
            // User is not admin
            return res.status(401).send("Invalid permissions");
        }else if(!userToDelete){
            // ID query is empty
            return res.status(400).send("Request id empty.");
        }else if (req.user.user_id == userToDelete){
            // User attempting to delete themselves
            return res.status(400).send("You cannot delete yourself.");
        }
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