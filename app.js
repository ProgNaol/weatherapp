import express from 'express';
import axios from 'axios';

const app = express();
const port = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.use(express.static('public')); 
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.render('index');
});

app.post('/', async (req, res) => {
    const city = req.body.city;  
    const apiKey = 'a95632f8fc85944acedfc23eb09ef234'; 
    
    try {
        const geoResponse = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}`);
        const { lat, lon } = geoResponse.data.coord;

        const forecastResponse = await axios.get(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`);

        const tomorrowForecast = forecastResponse.data.list[0];

        const willRain = tomorrowForecast.weather.some(w => w.main.toLowerCase() === 'rain');
        const temperature = tomorrowForecast.main.temp;
        const clouds = tomorrowForecast.clouds.all;
        const humidity = tomorrowForecast.main.humidity;

        res.render('index', { city, willRain, temperature, clouds, lat, lon, humidity });
    } catch (error) {
        res.render('error', { message: error.message });
    }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
