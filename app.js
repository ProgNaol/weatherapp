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
    const chosenDay = req.body.choose; // Get the selected day

    console.log(`City: ${city}, Day: ${chosenDay}`); // Log input for debugging

    try {
        const geoResponse = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}`);
        const { lat, lon } = geoResponse.data.coord;

        const forecastResponse = await axios.get(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`);

        let forecastIndex;
        switch (chosenDay) {
            case "Today":
                forecastIndex = 0; // Current day
                break;
            case "Tomorrow":
                forecastIndex = 1; // Next day
                break;
            case "Day After Tomorrow":
                forecastIndex = 2; // Day after tomorrow
                break;
            case "In 3 Days":
                forecastIndex = 3; // Three days later
                break;
            case "In 4 Days":
                forecastIndex = 4; // Four days later
                break;
            default:
                forecastIndex = 0; // Fallback to current day
                break;
        }

        const selectedForecast = forecastResponse.data.list[forecastIndex];

        const willRain = selectedForecast.weather.some(w => w.main.toLowerCase() === 'rain');
        const temperature = selectedForecast.main.temp;
        const clouds = selectedForecast.clouds.all;
        const humidity = selectedForecast.main.humidity;

        // Log the forecast data for debugging
        console.log(`Forecast Data: ${JSON.stringify(selectedForecast)}`);

        res.render('index', { city, willRain, temperature, clouds, lat, lon, humidity, choose: chosenDay });
    } catch (error) {
        console.error(error); // Log error for debugging
        res.render('error', { message: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
