import express from 'express';
import axios from 'axios';
import bodyParser from "body-parser";
import mongoose from "mongoose"; // Import mongoose
import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local"; // Use named import
import GoogleStrategy from "passport-google-oauth2";
import session from "express-session";
import MongoStore from "connect-mongo"; // Import connect-mongo
import env from "dotenv";

const app = express();
const port = process.env.PORT || 3000;
const saltRounds = 10;
env.config();

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, { 
  useNewUrlParser: true, 
  useUnifiedTopology: true 
})
.then(() => {
  console.log('MongoDB connected successfully!');
})
.catch(err => {
  console.error('MongoDB connection error:', err);
});


// Session setup with MongoDB store
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    store: MongoStore.create({ mongoUrl: mongoURI }), // Store sessions in MongoDB
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
app.post('/index', ensureAuthenticated, async (req, res) => {
  const city = req.body.city;
  const apiKey = 'a95632f8fc85944acedfc23eb09ef234';
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
    const checkResult = await db.collection("users").findOne({ email });

    if (checkResult) {
      res.redirect("/login");
    } else {
      bcrypt.hash(password, saltRounds, async (err, hash) => {
        if (err) {
          console.error("Error hashing password:", err);
        } else {
          await db.collection("users").insertOne({
            email: email,
            password: hash,
          });
          res.redirect("/login");
        }
      });
    }
  } catch (err) {
    console.log(err);
    res.status(500).send("Internal Server Error");
  }
});

passport.use(
  new LocalStrategy(async function (username, password, cb) {
    try {
      const user = await db.collection("users").findOne({ email: username });
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
