import express from 'express';
import axios from 'axios';
import bodyParser from "body-parser";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import session from "express-session";
import MongoStore from 'connect-mongo';
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;
const saltRounds = 10;

// MongoDB connection
const mongoURI = process.env.MONGODB_URI;

// Connect to MongoDB with improved error handling for serverless environments
let mongooseConnection = null;

const connectToMongoDB = async () => {
  if (mongooseConnection) {
    return mongooseConnection;
  }
  
  try {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(mongoURI, { 
        useNewUrlParser: true, 
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000
      });
      console.log('MongoDB connected successfully!');
    }
    mongooseConnection = mongoose.connection;
    return mongooseConnection;
  } catch (err) {
    console.error('MongoDB connection error:', err);
    throw err;
  }
};

// Initialize DB connection
connectToMongoDB().catch(err => {
  console.error('Failed to connect to MongoDB on startup:', err);
});

// Define User Schema
const UserSchema = new mongoose.Schema({
    email: String,
    password: String,
    googleId: String
});

const User = mongoose.model('User', UserSchema);

// Set up session store with better error handling
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback_secret_never_use_in_production',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ 
      mongoUrl: mongoURI,
      touchAfter: 24 * 3600, // time period in seconds
      autoRemove: 'native',
      crypto: {
        secret: process.env.SESSION_SECRET || 'fallback_secret_never_use_in_production'
      }
    }),
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 // 1 day
    }
}));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(passport.initialize());
app.use(passport.session());

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// Add logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Middleware to check if the user is authenticated
function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/login');
}

// Render home page (accessible to all)
app.get("/", (req, res) => {
    res.render("home.ejs", { user: req.user });
});

// Render login page
app.get("/login", (req, res) => {
    res.render("login.ejs", { user: req.user });
});

// Render register page
app.get("/register", (req, res) => {
    res.render("register.ejs", { user: req.user });
});

// Logout route
app.get("/logout", (req, res) => {
    req.logout(function (err) {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).render('error', { message: 'An error occurred during logout. Please try again.', user: req.user });
        }
        res.redirect("/");
    });
});

// Weather app page (protected)
app.get("/index", ensureAuthenticated, (req, res) => {
    res.render("index.ejs", { user: req.user });
});

app.post('/index', ensureAuthenticated, async (req, res) => {
    const city = req.body.city;
    const apiKey = process.env.OPENWEATHER_API_KEY;
    const chosenDay = req.body.choose;

    console.log(`City: ${city}, Day: ${chosenDay}`);

    try {
        const geoResponse = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}`);
        const { lat, lon } = geoResponse.data.coord;

        const forecastResponse = await axios.get(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`);

        let forecastIndex;
        switch (chosenDay) {
            case "Today": forecastIndex = 0; break;
            case "Tomorrow": forecastIndex = 1; break;
            case "Day After Tomorrow": forecastIndex = 2; break;
            case "In 3 Days": forecastIndex = 3; break;
            case "In 4 Days": forecastIndex = 4; break;
            default: forecastIndex = 0; break;
        }

        const selectedForecast = forecastResponse.data.list[forecastIndex];

        const willRain = selectedForecast.weather.some(w => w.main.toLowerCase() === 'rain');
        const temperature = selectedForecast.main.temp;
        const clouds = selectedForecast.clouds.all;
        const humidity = selectedForecast.main.humidity;

        console.log(`Forecast Data: ${JSON.stringify(selectedForecast)}`);

        res.render('index', { city, willRain, temperature, clouds, lat, lon, humidity, choose: chosenDay, user: req.user });
    } catch (error) {
        console.error('Error processing weather data:', error);
        res.status(500).render('error', { message: 'An error occurred while fetching weather data. Please try again.', user: req.user });
    }
});

// Google authentication route
app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

app.get("/auth/google/secrets", passport.authenticate("google", {
    successRedirect: "/index",
    failureRedirect: "/login"
}));

// Local login route
app.post("/login", passport.authenticate("local", {
    successRedirect: "/index",
    failureRedirect: "/login"
}));

// Register route
app.post("/register", async (req, res) => {
    const { username, password } = req.body;

    try {
        const existingUser = await User.findOne({ email: username });

        if (existingUser) {
            return res.redirect("/login");
        }

        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const newUser = new User({
            email: username,
            password: hashedPassword,
        });

        await newUser.save();
        res.redirect("/login");
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).render('error', { message: 'An error occurred during registration. Please try again.', user: req.user });
    }
});

// Local login strategy with improved error handling
passport.use(new LocalStrategy(
    { usernameField: 'username' },
    async function (username, password, done) {
        try {
            await connectToMongoDB();
            const user = await User.findOne({ email: username });
            if (!user) {
                return done(null, false, { message: 'Incorrect username.' });
            }
            
            // Handle case where user was created with Google and has no password
            if (!user.password) {
                return done(null, false, { message: 'Please login with Google.' });
            }
            
            const isValid = await bcrypt.compare(password, user.password);
            if (!isValid) {
                return done(null, false, { message: 'Incorrect password.' });
            }
            return done(null, user);
        } catch (err) {
            console.error('Local auth error:', err);
            return done(err);
        }
    }
));

// Google Strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/secrets",
    userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo"
},
async function(accessToken, refreshToken, profile, done) {
    try {
        await connectToMongoDB();
        const existingUser = await User.findOne({ googleId: profile.id });
        if (existingUser) {
            return done(null, existingUser);
        }
        const newUser = new User({
            googleId: profile.id,
            email: profile.emails[0].value
        });
        await newUser.save();
        done(null, newUser);
    } catch (err) {
        console.error('Google auth error:', err);
        done(err, null);
    }
}));

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        await connectToMongoDB();
        const user = await User.findById(id);
        done(null, user);
    } catch (err) {
        console.error('Error deserializing user:', err);
        done(err, null);
    }
});

// Add error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).render('error', { message: 'An unexpected error occurred. Please try again later.', user: req.user });
});

// For local development only
if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
    });
}

// Export the Express API for Vercel
export default app;