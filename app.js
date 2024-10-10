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
import EmailVerifier from 'email-verifier';


dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const saltRounds = 10;


const verifier = new EmailVerifier('dbf848ee-5254-48f0-ae8a-727f2f38d7cc');

// MongoDB connection
const mongoURI = process.env.MONGODB_URI;

// Connect to MongoDB
mongoose.connect(mongoURI, { 
    useNewUrlParser: true, 
    useUnifiedTopology: true 
})
.then(() => {
    console.log('MongoDB connected successfully!');
})
.catch(err => {
    console.error('MongoDB connection error:', err);
});

// Define User Schema
const UserSchema = new mongoose.Schema({
    email: String,
    password: String,
    googleId: String
});

const User = mongoose.model('User', UserSchema);

// Set up session store
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: mongoURI })
}));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(passport.initialize());
app.use(passport.session());

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// Middleware to check if the user is authenticated
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/login');
}

// Render home page (accessible to all)
app.get("/", (req, res) => {
  res.render("home.ejs");
});

// Render login page
app.get("/login", (req, res) => {
  res.render("login.ejs");
});

// Render register page
app.get("/register", (req, res) => {
  res.render("register.ejs");
});

// Logout route
app.get("/logout", (req, res) => {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
    res.redirect("/");
  });
});

// Weather app page (protected)
app.get("/index", ensureAuthenticated, (req, res) => {
  res.render("index", { user: req.user, city: null, willRain: null, temperature: null, clouds: null, lat: null, lon: null, humidity: null, choose: null });
});

// Modify the existing POST route for /index
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
      case "Today":
        forecastIndex = 0;
        break;
      case "Tomorrow":
        forecastIndex = 1;
        break;
      case "Day After Tomorrow":
        forecastIndex = 2;
        break;
      case "In 3 Days":
        forecastIndex = 3;
        break;
      case "In 4 Days":
        forecastIndex = 4;
        break;
      default:
        forecastIndex = 0;
        break;
    }

    const selectedForecast = forecastResponse.data.list[forecastIndex];

    const willRain = selectedForecast.weather.some(w => w.main.toLowerCase() === 'rain');
    const temperature = selectedForecast.main.temp;
    const clouds = selectedForecast.clouds.all;
    const humidity = selectedForecast.main.humidity;

    console.log(`Forecast Data: ${JSON.stringify(selectedForecast)}`);

    res.render('index', { city, willRain, temperature, clouds, lat, lon, humidity, choose: chosenDay, user: req.user });
  } catch (error) {
    console.error(error);
    res.render('error', { message: error.message });
  }
});


// Google authentication route
app.get(
  "/auth/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
  })
);

app.get(
  "/auth/google/secrets",
  passport.authenticate("google", {
    successRedirect: "/index",
    failureRedirect: "/login",
  })
);

// Local login route
app.post("/login", passport.authenticate("local", {
  successRedirect: "/index",
  failureRedirect: "/login",
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
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
});

// Local login strategy
passport.use(new LocalStrategy(
  { usernameField: 'username' },
  async function (username, password, done) {
    try {
      const user = await User.findOne({ email: username });
      if (!user) {
        return done(null, false, { message: 'Incorrect username.' });
      }
      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        return done(null, false, { message: 'Incorrect password.' });
      }
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));

// Google Strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "https://weatherapp-sjep.onrender.com/auth/google/secrets",
    userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo"
  },
  async function(accessToken, refreshToken, profile, done) {
    try {
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
      done(err, null);
    }
  }
));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});