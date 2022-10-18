const bcrypt = require("bcryptjs/dist/bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../model/user");

const login = async (req, res) => {
    try {
        // Get user input
        const { email, password } = req.body;
        // If email or password is blank
        if(!(email && password)) {
            return res.status(400).send("All input is required.");
        }
        // Validate if user exists in database
        var user = await User.findOne({ email });
        // Compare password
        if(user && (await bcrypt.compare(password, user.password))) {
            // Create token if password correct
            const token = jwt.sign(
                { user_id: user._id, email, admin: user.admin},
                process.env.JWT_SECRET,
                {
                    expiresIn: process.env.JWT_EXPIRES_IN,
                }
            );
            // Turn user into JSON object
            user = user._doc;
            delete user.password;
            // save token
            user.token = token;
            // Send client user data
            return res.status(200).json(user);
        }
        // Invalid password
        res.status(400).send("Invalid Credentials");
    } catch(err){
        console.log(err);
    }
}

module.exports = login;