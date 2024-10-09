import express from 'express';
import axios from 'axios';
import bodyParser from "body-parser";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import env from "dotenv";

// Load environment variables
env.config();

// Initialize the app
const app = express();
const port = process.env.PORT || 3000;
const saltRounds = 10;

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log("MongoDB connected");
}).catch(err => {
  console.error("MongoDB connection error:", err);
});

// User schema
const userSchema = new mongoose.Schema({
  email: String,
  password: String,
});

const User = mongoose.model("User", userSchema);

// Middleware for sessions
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

// Passport local strategy for authentication
passport.use(new LocalStrategy(
  async (username, password, done) => {
    try {
      const user = await User.findOne({ email: username });
      if (!user) {
        return done(null, false, { message: "User not found." });
      }
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return done(null, false, { message: "Invalid password." });
      }
      return done(null, user);
    } catch (err) {
      return done(err);
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
    done(err);
  }
});

// Middleware to check if user is authenticated
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/login');
}

// Routes
app.get("/", (req, res) => {
  res.render("home.ejs");
});

app.get("/login", (req, res) => {
  res.render("login.ejs");
});

app.get("/register", (req, res) => {
  res.render("register.ejs");
});

app.get("/logout", (req, res) => {
  req.logout(err => {
    if (err) {
      return next(err);
    }
    res.redirect("/");
  });
});

app.get('/index', ensureAuthenticated, (req, res) => {
  res.render('index');
});

// Registration route
app.post("/register", async (req, res) => {
  const email = req.body.username;
  const password = req.body.password;

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.redirect("/login");
    }

    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const newUser = new User({ email, password: hashedPassword });
    await newUser.save();

    req.login(newUser, (err) => {
      if (err) {
        console.error("Login error after registration:", err);
        return res.status(500).send("Internal Server Error");
      }
      res.redirect("/index");
    });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).send("Internal Server Error");
  }
});

// Local login route
app.post("/login", passport.authenticate("local", {
  failureRedirect: "/login",
  failureFlash: true,
}), (req, res) => {
  res.redirect("/index");
});

// Weather app form submission
app.post('/index', ensureAuthenticated, async (req, res) => {
  const city = req.body.city;
  const apiKey = 'a95632f8fc85944acedfc23eb09ef234'; // Make sure to keep this private
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

    res.render('index', { city, willRain, temperature, clouds, lat, lon, humidity, choose: chosenDay });
  } catch (error) {
    console.error("Weather API error:", error);
    res.render('error', { message: "Could not fetch weather data." });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
