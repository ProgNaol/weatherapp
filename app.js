import express from 'express';
import axios from 'axios';
import bodyParser from "body-parser";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import GoogleStrategy from "passport-google-oauth2";
import session from "express-session";
import env from "dotenv";

const app = express();
const port = process.env.PORT || 3000;
const saltRounds = 10;
env.config();

// Connect to MongoDB
// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('MongoDB connected successfully');
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
  });


// Create a User model
const userSchema = new mongoose.Schema({
  email: String,
  password: String
});

const User = mongoose.model('User', userSchema);

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
  })
);
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
app.get('/index', ensureAuthenticated, (req, res) => {
  res.render('index');
});

// Weather app form submission (protected)
// Weather app form submission (protected)
app.post('/index', ensureAuthenticated, async (req, res) => {
    const city = req.body.city;
    const apiKey = process.env.API_KEY; // Replace with your actual API key
    const chosenDay = req.body.choose;
  
    console.log(`City: ${city}, Day: ${chosenDay}`);
  
    try {
      // First, get the geographical coordinates for the city
      const geoResponse = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}`);
      const { lat, lon } = geoResponse.data.coord;
  
      // Then, get the weather forecast for the next days
      const forecastResponse = await axios.get(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`);
  
      // Determine the index for the forecast based on the chosen day
      let forecastIndex;
      switch (chosenDay) {
        case "Today":
          forecastIndex = 0; // Today's forecast
          break;
        case "Tomorrow":
          forecastIndex = 1; // Tomorrow's forecast
          break;
        case "Day After Tomorrow":
          forecastIndex = 2; // Day after tomorrow's forecast
          break;
        case "In 3 Days":
          forecastIndex = 3; // Forecast in 3 days
          break;
        case "In 4 Days":
          forecastIndex = 4; // Forecast in 4 days
          break;
        default:
          forecastIndex = 0; // Default to today
          break;
      }
  
      // Get the selected forecast data
      const selectedForecast = forecastResponse.data.list[forecastIndex];
  
      // Extract necessary data from the forecast
      const willRain = selectedForecast.weather.some(w => w.main.toLowerCase() === 'rain');
      const temperature = selectedForecast.main.temp;
      const clouds = selectedForecast.clouds.all;
      const humidity = selectedForecast.main.humidity;
  
      console.log(`Forecast Data: ${JSON.stringify(selectedForecast)}`);
  
      // Render the index view with the weather data
      res.render('index', {
        city,
        willRain,
        temperature,
        clouds,
        lat,
        lon,
        humidity,
        choose: chosenDay,
      });
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
app.post(
  "/login",
  passport.authenticate("local", {
    successRedirect: "/index",
    failureRedirect: "/login",
  })
);

// Register route
app.post("/register", async (req, res) => {
  const email = req.body.username;
  const password = req.body.password;

  try {
    const existingUser = await User.findOne({ email });
    
    if (existingUser) {
      res.redirect("/login");
    } else {
      const hash = await bcrypt.hash(password, saltRounds);
      const newUser = new User({ email, password: hash });
      await newUser.save();
      req.login(newUser, (err) => {
        res.redirect("/index");
      });
    }
  } catch (err) {
    console.log(err);
  }
});

passport.use(
  new LocalStrategy(async function (username, password, cb) {
    try {
      const user = await User.findOne({ email: username });
      if (user) {
        const valid = await bcrypt.compare(password, user.password);
        if (valid) {
          return cb(null, user);
        } else {
          return cb(null, false, { message: "Incorrect password" });
        }
      } else {
        return cb(null, false, { message: "User not found" });
      }
    } catch (err) {
      console.log(err);
      return cb(err);
    }
  })
);

passport.serializeUser((user, cb) => {
  cb(null, user);
});

passport.deserializeUser((user, cb) => {
  cb(null, user);
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
