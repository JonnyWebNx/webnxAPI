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
        const user = await User.findOne({ email });
        //
        if(user && (await bcrypt.compare(password, user.password))) {
            // Create token
            const token = jwt.sign(
                { user_id: user._id, email },
                process.env.JWT_SECRET,
                {
                    expiresIn: process.env.JWT_EXPIRES_IN,
                }
            );
            
            // save token
            user.token = token;
            
            // user
            return res.status(200).json(user);
        }
        res.status(400).send("Invalid Credentials");
    } catch(err){
        console.log(err);
    }
}

module.exports = login;