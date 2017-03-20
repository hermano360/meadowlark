var express 	= require('express');
var fortune 	= require('./lib/fortune.js');
var formidable 	= require('formidable');
var jpupload 	= require('jquery-file-upload-middleware');
var credentials	= require('./credentials.js');
var connect = require('connect');
var emailService = require('./lib/email.js')(credentials);
var fs = require('fs');
Vacation = require('./models/vacation.js');
var app = express();

//set up handlebars view engine
var handlebars = require('express-handlebars')
	.create({ 
		defaultLayout:'main',
		helpers: {
			section: function(name, options){
				if(!this._sections) this._sections = {};
				this._sections[name]= options.fn(this);
				return null;
			}
		}});

app.engine('handlebars', handlebars.engine);
app.set('view engine', 'handlebars');

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

app.set('port', process.env.PORT || 3000);

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


app.use(express.static(__dirname + '/public'));

app.use(require('body-parser').urlencoded({extended:true}));

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

})

// set 'showTests' context property if the querystring contains test=1
app.use(function(req, res, next){
	res.locals.showTests = app.get('env') !== 'production' && 
		req.query.test === '1';
	next();
});


app.use(require('./lib/tourRequiresWaiver.js'));


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

app.use(function(req,res,next){
	// if theres a flash message, transfer
	// it to the context, then clear it
	res.locals.flash = req.session.flash;
	delete req.session.flash;
	next();
});

// app.use(function(req,res,next){
// 	var cluster = require('cluster');
// 	if(cluster.isWorker) console.log('Worker %d received request', cluster.worker.id);
// });

app.get('/', function(req,res){
	res.render('home');
});

app.get('/about', function(req,res){
	res.render('about', { 
		fortune: fortune.getFortune(),
		pageTestScript: '/qa/tests-about.js'
	 });
});

app.get('/tours/hood-river',function(req,res){
	res.render('tours/hood-river');
});

app.get('/tours/request-group-rate', function(req,res){
	res.render('tours/request-group-rate');
});

app.get('/nursery-rhyme', function(req,res){
	res.render('nursery-rhyme');
});
app.get('/data/nursery-rhyme', function(req,res){
	res.json({
		animal: 'squirrel',
		bodyPart: 'tail',
		adjective: 'bushy',
		noun: 'heck'
	});
});

app.get('/newsletter', function(req,res){
	//we will learn about CSRF later..for now we will just provide dummy value
	res.render('newsletter', { csrf: 'Test Test the real value goes here later' });
	// emailService.send('hermano360@gmail.com', 'Hood River tours on sale Today!', 'Get \'em while they\'re hot!');
});

// slightly modified version of the official W3C HTML5 email regex
// https://html.spec.whatwg.org/multipage/forms.html#valid-e-mail-address
// for now, we're mocking NewsletterSignup:
function NewsletterSignup(){
}
NewsletterSignup.prototype.save = function(cb){
	cb();
};


var VALID_EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

app.post('/newsletter', function(req, res){
	var name = req.body.name || '', email = req.body.email || '';
	// input validation
	if(!email.match(VALID_EMAIL_REGEX)) {
		if(req.xhr) return res.json({ error: 'Invalid name email address.' });
		req.session.flash = {
			type: 'danger',
			intro: 'Validation error!',
			message: 'The email address you entered was  not valid.',
		};
		return res.redirect(303, '/newsletter/archive');
	}

		// NewsletterSignup is an example of an object you might create
		// since every implementation will vary, it is up to you to write these
		// project-specific interfaces. This simply shows how a typical Express
		// implementation might look in your project.
		
	new NewsletterSignup({ name: name, email: email }).save(function(err){
		if(err) {
			if(req.xhr) return res.json({ error: 'Database error.' });
			req.session.flash = {
				type: 'danger',
				intro: 'Database error!',
				message: 'There was a database error; please try again later.',
			};
			return res.redirect(303, '/newsletter/archive');
		}


		if(req.xhr) return res.json({ success: true });
		req.session.flash = {
			type: 'success',
			intro: 'Thank you!',
			message: 'You have now been signed up for the newsletter.',
		};
		return res.redirect(303, '/newsletter/archive');
	});
});


var cartValidation = require('./lib/cartValidation.js');

app.use(cartValidation.checkWaivers);
app.use(cartValidation.checkGuestCounts);

app.get('/cart/add', function(req, res, next){
	var cart = req.session.cart || (req.session.cart = { items: [] });
	Vacation.findOne({ sku: req.query.sku }, function(err, vacation){
		if(err) return next(err);
		if(!vacation) return next(new Error('Unknown vacation SKU: ' + req.query.sku));
		cart.items.push({
			vacation: vacation,
			guests: req.body.guests || 1,
		});
		res.redirect(303, '/cart');
	});
});
app.post('/cart/add', function(req, res, next){
	var cart = req.session.cart || (req.session.cart = { items: [] });
	Vacation.findOne({ sku: req.body.sku }, function(err, vacation){
		if(err) return next(err);
		if(!vacation) return next(new Error('Unknown vacation SKU: ' + req.body.sku));
		cart.items.push({
			vacation: vacation,
			guests: req.body.guests || 1,
		});
		res.redirect(303, '/cart');
	});
});
app.get('/cart', function(req, res, next){
	var cart = req.session.cart;
	if(!cart) next();
	res.render('cart', { cart: cart });
});
app.get('/cart/checkout', function(req, res, next){
	var cart = req.session.cart;
	if(!cart) next();
	res.render('cart-checkout');
});
app.get('/cart/thank-you', function(req, res){
	res.render('cart-thank-you', { cart: req.session.cart });
});
app.get('/email/cart/thank-you', function(req, res){
	res.render('email/cart-thank-you', { cart: req.session.cart, layout: null });
});
app.post('/cart/checkout', function(req, res){
	var cart = req.session.cart;
	if(!cart) next(new Error('Cart does not exist.'));
	var name = req.body.name || '', email = req.body.email || '';
	// input validation
	if(!email.match(VALID_EMAIL_REGEX)) return res.next(new Error('Invalid email address.'));
	// assign a random cart ID; normally we would use a database ID here
	cart.number = Math.random().toString().replace(/^0\.0*/, '');
	cart.billing = {
		name: name,
		email: email,
	};
    res.render('email/cart-thank-you', 
    	{ layout: null, cart: cart }, function(err,html){
	        if( err ) console.log('error in email template');
	        emailService.send(cart.billing.email,
	        	'Thank you for booking your trip with Meadowlark Travel!',
	        	html);
	    }
    );
    res.render('cart-thank-you', { cart: cart });
});




app.get('/thank-you', function(req,res){
	res.render('thank-you');
});

app.post('/cart/checkout', function(req,res){
	var cart = req.session.cart;
	if(!cart) next(new Error('Cart does not exist.'));
	var name = req.body.name || '', email = req.body.email || '';
	//input validation
	if(!email.match(VALID_EMAIL_REGEX)){
		return res.next(new Error('Invalid email address.'));
	}
	//assign a random cart ID; normally we use a database ID here
	cart.number = Math.random().toString().replace(/^0\.0*/,'');
	cart.billing = {
		name: name,
		email: email
	};
	res.render('email/cart-thank-you',
		{layout: null, cart: cart}, function(err,html){
			if(err) console.log('error in email template');
			mailTransport.sendMail({
				from: '"Meadowlark Travel": info@meadowlarktravel.com',
				to: cart.billing.email,
				subject: 'Thank you for Booking your Traip with Meadowlark',
				html: html,
				generateTextFromHtml: true
			}, function(err){
				if(err) console.error('Unable to send confirmation: ' + err.stack);
			});
		}
		);
	res.render('cart-thank-you', { cart: cart });
});

app.get('/contest/vacation-photo', function(req,res){
	var now = new Date();
	res.render('contest/vacation-photo', {
		year: now.getFullYear(),month: now.getMonth()
	});
});


// make sure data directory exists
var dataDir = __dirname + '/data';
var vacationPhotoDir = dataDir + '/vacation-photo';
if(!fs.existsSync(dataDir)) fs.mkdirSync(dataDir); 
if(!fs.existsSync(vacationPhotoDir)) fs.mkdirSync(vacationPhotoDir);

function saveContestEntry(contestName, email, year, month, photoPath){
    // TODO...this will come later
}

app.post('/contest/vacation-photo/:year/:month', function(req, res){
    var form = new formidable.IncomingForm();
    form.parse(req, function(err, fields, files){
        if(err) {
            req.session.flash = {
                type: 'danger',
                intro: 'Oops!',
                message: 'There was an error processing your submission. ' +
                    'Pelase try again.',
            };
            return res.redirect(303, '/contest/vacation-photo');
        }
        var photo = files.photo;
        var dir = vacationPhotoDir + '/' + Date.now();
        var path = dir + '/' + photo.name;
        fs.mkdirSync(dir);
        fs.renameSync(photo.path, dir + '/' + photo.name);
        saveContestEntry('vacation-photo', fields.email,
            req.params.year, req.params.month, path);
        req.session.flash = {
            type: 'success',
            intro: 'Good luck!',
            message: 'You have been entered into the contest.',
        };
        return res.redirect(303, '/contest/vacation-photo/entries');
    });
});



app.post('/process',function(req,res){

	if(req.xhr || req.accepts('json,html')==='json'){
		//if there was an error, we should send { error: 'error description'}
		res.send({success:true});
	} else {
		//if there was an eror, we would redirect to an error page
		res.redirect(303,'/thank-you');
	}
	console.log('Form (from querystring): ' + req.query.form);
	console.log('CSRF token (from hidden form field): ' + req.body._csrf);
	console.log('Name (from visible form field): ' + req.body.name);
	console.log('Email (from visible form field): ' + req.body.email);
});

app.use('/upload', function(req,res,next){
	var now = Date.now();
	jpupload.filehHandler({
		uploadDir: function(){
			return __dirname + '/public/uploads/' + now;
		},
		uploadUrl: function() {
			return '/uploads/'+now;
		}
	})(req,res,next);
});

app.get('/set-currency/:currency', function(req,res){
	req.session.currency = req.params.currency;
	return res.redirect(303, '/vacations');
});

function convertFromUSD(value, currency){
	switch(currency){
		case 'USD': return value * 1;
		case 'GBP': return value * 0.6;
		case 'BTC': return value * 0.002370;
		default: return NaN;
	}
}

app.get('/vacations', function(req,res){
	Vacation.find({available: true }, function(err,vacations){
		var currency = req.session.currency || 'USD';
		var context = {
			currency: currency,
			vacations: vacations.map(function(vacation){
				return {
					sku: vacation.sku,
					name: vacation.name,
					description: vacation.description,
					qty: vacation.qty,
					price: convertFromUSD(vacation.priceInCents/100,currency),
					inSeason: vacation.inSeason
				}
			})
		};
		switch(currency){
			case 'USD': context.currencyUSD = 'selected'; break;
			case 'GBP': context.currencyGBP = 'selected'; break;
			case 'BTC': context.currencyBTC = 'selected'; break;
		}
		res.render('vacations', context);
	})
})

 
app.get('/fail', function(req,res){
	throw new Error("Nope!");
});
app.get('/epic-fail', function(req,res){
	process.nextTick(function(){
		throw new Error('Kaboom!');
	});
});







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

function startServer() {
	app.listen(app.get('port'), function() {
		console.log( 'Express started in '+ app.get('env') + ' mode on http://localhost:' + 
		app.get('port')+ '; Press Ctrl-C to terminate.');
	});
}

if(require.main === module){
	//application run directly; start app server
	startServer();
} else {
	// application imported as a module via "require": export function
	// to create server
	module.exports = startServer;
}






