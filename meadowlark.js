var express 	= require('express'),
	https = require('https'),
	fortune = require('./lib/fortune.js'),
	formidable 	= require('formidable'),
	fs = require('fs'),
	Vacation = require('./models/vacation.js'),
	Q = require('q'),
	VacationInSeasonListener = require('./models/vacationInSeasonListener.js'),
	vhost = require('vhost'),
	connect = require('connect');


var app = express();

var credentials	= require('./credentials.js');
var emailService = require('./lib/email.js')(credentials);

//set up handlebars view engine
var handlebars = require('express-handlebars').create({ 
		defaultLayout:'main',
		helpers: {
			section: function(name, options){
				if(!this._sections) this._sections = {};
				this._sections[name]= options.fn(this);
				return null;
			},
			static: function(name){
				return require('./lib/static.js').map(name);
			}
}});

app.engine('handlebars', handlebars.engine);
app.set('view engine', 'handlebars');

// set up css/js bundling
var bundler = require('connect-bundle')(require('./config.js'));
app.use(bundler);

app.set('port', process.env.PORT || 3000);

app.use('/api', require('cors')());

app.use(function(req,res,next){
	// create a domain for this request
	var domain = require('domain').create();
	// handle errors on this domain
	domain.on('error', function(err){
		console.error('DOMAIN ERROR CAUGHT\n', err.stack);
		try {
			// failsafe shutdown in 5 seconds
			setTimeout(function(){
				console.error('Failsafe shutdown.');
				process.exit(1);
			}, 5000);

			// disconnect from the cluster
			var worker = require('cluster').worker;
			if(worker) worker.disconnect();

			// stop taking new requests
			server.close();

			try {
				// attempt to use Express error route
				next(err);
			} catch(err) {
				// if Express error route failed, try
				// plain Node response
				console.error('Express error mechanism failed.\n', err.stack);
				res.statusCode = 500;
				res.setHeader('content-type', 'text/plain');
				res.end('Server error.');
			}
		} catch(err){
			console.error('Unable to send 500 response.\n', err.stack);
		}
	});

	// add the request and response objects to the domain
	domain.add(req);
	domain.add(res);

	// execute the reest of the request chain in the domain
	domain.run(next);
});



switch(app.get('env')){
	case 'development':
		// compact, colorful dev logging
		app.use(require('morgan')('dev'));
		break;
	case 'production':
		// module 'express-logger' supports daily log rotation
		app.use(require('express-logger')({
			path: __dirname + '/log/requests.log'
		}));
		break;
}

var MongoSessionStore = require('session-mongoose')(require('connect'));
var sessionStore = new MongoSessionStore({ url:
	credentials.mongo[app.get('env')].connectionString });

app.use(require('cookie-parser')(credentials.cookieSecret));
app.use(require('express-session')({
	resave : false,
	saveUninitialized: false,
	secret: credentials.cookieSecret,
	store: sessionStore
}));

app.use(express.static(__dirname + '/public'));
app.use(require('body-parser').urlencoded({extended:true}));

app.use(require('csurf')());

app.use(function(req,res,next){
	res.locals._csrfToken = req.csrfToken();
	next();
});

// database configuration
var mongoose = require('mongoose');
var opts = {
	server: {
		socketOptions: { keepAlive: 1}
	}
};

switch(app.get('env')){
	case 'development':
		mongoose.connect(credentials.mongo.development.connectionString, opts);
		break;
	case 'production':
		mongoose.connect(credentials.mongo.production.connectionString, opts);
		break;
	default:
		throw new Error('Unknown execution environment: ' + app.get('env'));
}

// Seeding initial MongoDB Data
Vacation.find(function(err,vacations){
	if(err) return console.log(err);
	if(vacations.length) return;

	new Vacation({
		name: "Hood River Day Trip",
		slug: 'hood-river-day-trip',
		category: 'Day Trip',
		sku: "HR199",
		description: 'Spend a day sailing on the Columbia and ' + 
			'enjoying craft beers in Hood River!',
		priceInCents: '9995',
		tags: ['day trip', 'hood river', 'sailing', 'windsurfing', 'breweries'],
		inSeason: true,
		maximumGuests: 16,
		available:true,
		packagesSold: 0
	}).save();

	new Vacation({
		name: "Oregon Coast Getaway",
		slug: "oregon-coast-getaway",
		category: 'Weekend Getaway',
		sku: 'OC39',
		description: 'Enjoy the ocean air and quaint coastal townsend!',
		priceInCents: 269995,
		tags: ['weekend getaway', 'oregon coast', 'beachcombing'],
		inSeason: true,
		maximumGuests: 8,
		available: true,
		packagesSold: 0
	}).save();

	new Vacation({
		name: "Rock Climbing in Bend",
		slug: 'rock-climbing-in-bend',
		category: 'Adventure',
		sku: 'B99',
		description: 'Experience the Thrill of climbing in the high desert.', 
		priceInCents: 289995,
		tags: ['weekend getaway', 'bend', 'high desert','rock climbing'],
		inSeason: true,
		requiresWaiver: true,
		maximumGuests: 4,
		available: true,
		packagesSold: 0,
		notes: 'The tour guide is currently recoving from a skiiing accident'
	}).save();

});

app.use(function(req,res,next){
	// if theres a flash message, transfer
	// it to the context, then clear it
	res.locals.flash = req.session.flash;
	delete req.session.flash;
	next();
});

// set 'showTests' context property if the querystring contains test=1
app.use(function(req, res, next){
	res.locals.showTests = app.get('env') !== 'production' && 
		req.query.test === '1';
	next();
});

// mocked weather data
function getWeatherData(){
    return {
        locations: [
            {
                name: 'Portland',
                forecastUrl: 'http://www.wunderground.com/US/OR/Portland.html',
                iconUrl: 'http://icons-ak.wxug.com/i/c/k/cloudy.gif',
                weather: 'Overcast',
                temp: ' 54.1 F (12.3 C)',
            },
            {
                name: 'Duarte',
                forecastUrl: 'http://www.wunderground.com/US/CA/Duarte.html',
                iconUrl: 'http://icons-ak.wxug.com/i/c/k/partlycloudy.gif',
                weather: 'Partly Cloudy',
                temp: ' 55.0 F (12.8 C)',
            },
            {
                name: 'Manzanita',
                forecastUrl: 'http://www.wunderground.com/US/OR/Manzanita.html',
                iconUrl: 'http://icons-ak.wxug.com/i/c/k/rain.gif',
                weather: 'Light Rain',
                temp: ' 55.0 F (12.8 C)',
            },
        ],
    };
}

// middleware to add weather data to context
app.use(function(req, res, next){
	if(!res.locals.partials) res.locals.partials = {};
 	res.locals.partials.weatherContext = getWeatherData();
 	next();
});

var topTweets = {
	count: 10,
	lastRefreshed: 0,
	refreshInterval: 15 * 60 * 1000,
	tweets: []
};

function getTopTweets(cb){
	if(Date.now() < topTweets.lastRefreshed + topTweets.refreshInterval){
		return cb(topTweets.tweets);
	}
	twitter.search('#meadowlarktravel', topTweets.count, function(result){
		var formattedTweets = [];
		var promises = [];
		var embedOpts = { omit_script: 1};
		result.statuses.forEach(function(status){
			var deferred  = Q.defer();
			twitter.embed(status.id_str, embedOpts, function(embed){
				formattedTweets.push(embed.html);
				deferred.resolve();
			});
			promises.push(deferred.promise);
		});
		Q.all(promises).then(function(){
			topTweets.lastRefreshed = Date.now();
			cb(topTweets.tweets = formattedTweets);
		});
	});
}


//adding easter egg
var static = require('./lib/static.js').map;

app.use(function(req,res,next){
	var now = new Date();
	res.locals.logoImage = now.getMonth()==2 && now.getDate()==23 ?
		static('/img/logo_bud_clark.png') : static('/img/logo.png');
	next();
});

//creating "admin" subdomain
var admin = express.Router();
app.use(vhost('admin.*', admin));

//creating "admin" routes
admin.get('/', function(req,res){
	res.render('admin/home');
});
admin.get('/users', function(req,res){
	res.render('admin/users');
});


//routes
var routes = require('./routes.js')(app);

//api

var Attraction = require('./models/attraction.js');

var rest = require('connect-rest');



// Seeding initial attractions MongoDB Data
Attraction.find(function(err,attractions){
	if(err) return console.log(err);
	if(attractions.length) return;

	new Attraction({
		name: "Hood River Day Attraction",
		description: 'Spend a day sailing on the Columbia and ' + 
					 'enjoying craft beers in Hood River!',
		location: {lat: 34, lng: -134},
		history: {
			event: "Not sure whats meant to go here",
			notes: "There are notes here",
			email: "brother360@gmail.com",
			date: 10/28/1992
		},
		updateId: "IDK what this is",
		approved: true
	}).save();

});

rest.get('/attractions', function(req, content, cb){
    Attraction.find({ approved: true }, function(err, attractions){
        if(err) return cb({ error: 'Internal error.' });

        cb(null, attractions.map(function(a){
            return {
                name: a.name,
                description: a.description,
                location: a.location
            };
        }));
    });
});

rest.post('/attraction', function(req, content, cb){
    var a = new Attraction({
        name: req.body.name,
        description: req.body.description,
        location: { lat: req.body.lat, lng: req.body.lng },
        history: {
            event: 'created',
            email: req.body.email,
            date: new Date(),
        },
        approved: false,
    });
    a.save(function(err, a){
        if(err) return cb({ error: 'Unable to add attraction.' });
        cb(null, { id: a._id });
    }); 
});

rest.get('/attraction/:id', function(req, content, cb){
    Attraction.findById(req.params.id, function(err, a){
        if(err) return cb({ error: 'Unable to retrieve attraction.' });
        cb(null, { 
            name: a.name,
            description: a.description,
            location: a.location,
        });
    });
});

//API configuration
var apiOptions = {
	context: '/',
	domain: require('domain').create()
};

apiOptions.domain.on('error', function(err){
    console.log('API domain error.\n', err.stack);
    setTimeout(function(){
        console.log('Server shutting down after API domain error.');
        process.exit(1);
    }, 5000);
    server.close();
    var worker = require('cluster').worker;
    if(worker) worker.disconnect();
});

var auth = require('./lib/auth.js')(app, {
	// baseUrl is optional; it will default to localhost if you omit it;
	// it can be helpful to set this if you're not working on your local machine. 
	// For example, if you were using a staging server,
	// you might set the BASE_URL env to https://staging.meadowlark.com
	baseUrl: process.env.Base_URL,
	providers: credentials.authProviders,
	successRedirect: '/account',
	failureRedirect: '/unauthorized'
});

// auth.init() links in Passport middleware:
auth.init();

// now we can specify our auth routes:
auth.registerRoutes();

function customerOnly(req,res,next) {
	if(req.user && req.user.role==='customer') return next();
	//we want customer-only pages to know they need to logon
	res.redirect(303, '/unauthorized');
}

function employeeOnly(req,res,next){
	if(req.user && req.user.role==='employee') return next();
	//we want employee-only authorization failures to be 'hidden'
	//to prevent potential hackers from even knowing such a page
	//exits
	next('route');
}

function allow(roles){
	return function(req,res, next){
		if(req.user && roles.split(',').indexOf(req.user.role)!==-1) return next();
		res.render(303,'/unauthorized');
	};
}



// app.get('/account', function(req,res){
// 	if(!req.user) return res.redirect(303, '/unauthorized');
// 	res.render('account', { username: req.user.name });
// });

//we also need an 'unauthorized' page
app.get('/unauthorized', function(req,res){
	res.status(403).render('unauthorized');
});

app.get('/account', allow('customer,employee'), function(req,res){
	res.render('account');
});

app.get('/account/order-history', customerOnly, function(req,res){
	res.render('account/order-history');
});

app.get('/account/email-prefs', customerOnly, function(req,res){
	res.render('account/email-prefs');
});

//employer routes
app.get('/sales', employeeOnly, function(req,res){
	res.render('sales');
});


//link API into pipeline
app.use(vhost('api.*', rest.rester(apiOptions)));



// custom 404 page
app.use(function(req,res){
	res.status(404);
	res.render('404');
});

// custom 500 page
app.use(function(err,req,res,next){
	console.error(err.stack);
	res.status(500).render('500');
});


var server;
var options = {
	key: fs.readFileSync(__dirname + '/ssl/meadowlark.pem'),
	cert: fs.readFileSync(__dirname + '/ssl/meadowlark.crt')
}

function startServer() {
	https.createServer(options,app).listen(app.get('port'), function(){
		console.log('Express started in ' + app.get('env') + ' mode on port ' + app.get('port') + ' using HTTPS.');
	})
}

if(require.main === module){
	//application run directly; start app server
	startServer();
} else {
	// application imported as a module via "require": export function
	// to create server
	module.exports = startServer;
}






