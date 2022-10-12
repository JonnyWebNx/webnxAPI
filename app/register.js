const register = async (req, res) => {
    // register logic
    try {
        // Get user input
        const { first_name, last_name, email, password } = req.body;

        // Validate user input
        if(!(email && password && first_name && last_name)) {
            return res.status(400).send("All input is required");
        }

        // check if user already exists
        // Validate if user exists in our database
        const oldUser = await User.findOne({ email });

        if (oldUser) {
            return res.status(409).send("User already exists.  Please login.");
        }

        // Encrypt user password
        encryptedPassword  = await bcrypt.hash(password, 10);

        // Create user in our database
        const user = await User.create({
            first_name,
            last_name,
            email: email.toLowerCase(),
            password: encryptedPassword,
        });

        // Create token
        const token  = jwt.sign(
            { user_id: user._id, email },
            process.env.JWT_SECRET,
            {
                expiresIn: process.env.JWT_EXPIRES_IN,
            }
        );
        // Save user token 
        user.token = token;
        
        // return new user
        return res.status(201).json(user);
    } catch(err) {
        console.log(err);
    }
    // End register logic
}

module.exports = register;