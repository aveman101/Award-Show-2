'use strict';

if (typeof String.prototype.startsWith != 'function') {
	String.prototype.startsWith = function (str){
		return this.lastIndexOf(str, 0) === 0;
	};
}

var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var fs = require('fs');

var _ = require('underscore');
var uuid = require('node-uuid');



// Capture a user-defined port number from the command line
const args = process.argv.slice(2);
let userProperties = _(['portNumber']).object(args);

// Set default values for undefined properties
_(userProperties).defaults({
	"portNumber": 3000,
});




// Safari has a bug where it won't reload the right page.
app.get('/*', function(req, res, next){ 
	res.setHeader('Last-Modified', (new Date()).toUTCString());
	next(); 
});

app.use('/lib', express.static(__dirname + '/lib'));
app.use('/js', express.static(__dirname + '/js'));
app.use('/css', express.static(__dirname + '/css'));
app.use('/img', express.static(__dirname + '/img'));
app.use('/templates', express.static(__dirname + '/templates'));



// User Voting
app.get('/', function(req, res){
	res.sendfile('index.html');
});

// Television View
app.get('/tv', function(req, res){
	res.sendfile('tv.html');
});

// Admin View
app.get('/admin', function(req, res) {
	res.sendfile('admin.html');
});





// utility functions
function newUserNamed(username) {
	return {
		"name":username,
		"picks":{},
		"braggingRights":0,
		"buyIn":0,
		"uuid":uuid.v4()
	}
}

function applyUpdatesToCollection(collection, updates, uniqueKey) {

	// updates might be an array, or it might be a simgle object to update.
	// Make sure to update all the items in the array.
	if (!_.isArray(updates)) {
		updates = [updates];
	}

	// Loop through each of the updated items.
	// If this item doesn't exist yet, add it.
	// If this item does exist, update it.
	var existingItems = _.pluck(collection, uniqueKey);
	_.each(updates, function(item) {

		// Check to see if this item already exists.
		if (_.contains(existingItems, item[uniqueKey])) {

			// The item already exists. Find this item, and replace it.
			var existingIndex = _.indexOf(existingItems, item[uniqueKey]);
			collection[existingIndex] = item;

		} else {

			// The item does not exist, so push it onto the stack.
			collection.push(item);

		}
	});
}




// Make sure the config directory exists (it probably won't be cloned from Git)
// This only needs to be run once on startup.
try {
	fs.mkdirSync(__dirname + "/config/");
} catch(e) {

	// node will throw an EEXIST exception if the folder already exists.
	// We don't care if the folder already exists, but other errors might be important.
	if ( e.code != 'EEXIST' ) throw e;
}






function readConfigSync(configIdentifier) {

	var configFile = __dirname + "/config/"+configIdentifier+".json";
	console.log(configFile);
	if (!fs.existsSync(configFile)) {

		// The file does not exists. Try the defaults file.
		configFile = __dirname + "/config/"+configIdentifier+".default.json";
		if (!fs.existsSync(configFile)) {

			return undefined;	
		}
	}

	// The file exists, so it's time to read it into memory
	const configString = fs.readFileSync(configFile, "utf8");
	const result = JSON.parse(configString);

	return result;
}

function writeConfig(jsonData, configIdentifier) {
	var configFile = __dirname + "/config/"+configIdentifier+".json";
	fs.writeFile(configFile, JSON.stringify(jsonData, null, 4), function(err) {
		if(err) {
			console.log(err);
		} else {
			console.log("JSON saved to " + configFile);
		}
	});
}








// Load the list of categories and nominees.
var categories = readConfigSync("categories");

// Undefined categories is a fatal error condition. Exit immediately.
if (!categories) {
	console.log("\n\nWARNING: ./config/categories.json does not exist.\n"+
		"This file is necessary in order for the application to work.\n"+
		"For demonstration purposes, I will create a categories.json\n"+
		"file for you, with three of the categories from the 2013\n"+
		"Oscars awards.\n");

	categories = [
		{
			"name":"Best Picture",
			"value":100,
			"nominees": [
				{
					"title":"American Hustle"
				},
				{
					"title":"Captain Phillips"
				},
				{
					"title":"Dallas Buyers Club"
				},
				{
					"title":"Gravity"
				},
				{
					"title":"Her"
				},
				{
					"title":"Nebraska"
				},
				{
					"title":"Philomena"
				},
				{
					"title":"12 Years a Slave"
				},
				{
					"title":"The Wolf of Wall Street"
				}

			]
		},
		{
			"name":"Best Actor in a Leading Role",
			"value":100,
			"nominees": [
				{
					"title":"Christian Bale",
					"subtitle":"American Hustle"
				},
				{
					"title":"Bruce Dern", 
					"subtitle":"Nebraska"
				},
				{
					"title":"Leonardo DiCaprio",
					"subtitle":"The Wolf of Wall Street"
				},
				{
					"title":"Chiwetel Ejiofor",
					"subtitle":"12 Years a Slave"
				},
				{
					"title":"Matthew McConaughey",
					"subtitle":"Dallas Buyers Club"
				}
			]
		},
		{
			"name":"Best Actress in a Leading Role",
			"value":100,
			"nominees": [
				{
					"title":"Amy Adams",
					"subtitle":"American Hustle"
				},
				{
					"title":"Cate Blanchett", 
					"subtitle":"Blue Jasmine"
				},
				{
					"title":"Sandra Bullock",
					"subtitle":"Gravity"
				},
				{
					"title":"Judi Dench",
					"subtitle":"Philomena"
				},
				{
					"title":"Meryl Streep",
					"subtitle":"August: Osage County"
				}
			]
		}
	];
}

// Loop through the list of categories and make sure the values are set appropriately.
_.each(categories, function(category) {
	_.defaults(category, {distinguished: false, votingActive: false, value: 25, locked: false});

	// Loop through the nominees, and make sure each one defaults to "winner: false"
	_.each(category.nominees, function(nominee) {
		_.defaults(nominee, {winner: false});
	});
});
writeConfig(categories, "categories");

// If the client requests the categories, give them the contents of this variable.
app.get('/config/categories.json', function(req, res) {
	res.json(categories);
});












// Establish a set of users.
var users = readConfigSync("users");

// If the file does not exist, make users into an empty array.
if (!users) {
	users = [];
}

// If the user asks for the users, give them the JSON data from memory.
app.get('/config/users.json', function(req, res) {
	res.json(users);
});








// Load the trivia questions.
var triviaQuestions = readConfigSync("triviaQuestions");

// If the trivia questions do not exist, create an empty for it.
if (!triviaQuestions) {
	triviaQuestions = [];
}

app.get('/config/triviaQuestions.json', function(req, res) {
	res.json(triviaQuestions);
});











// User API
io.on('connection', function(socket){

	// Use this event to either retrieve the user from the list,
	// or create a new user with the provided name.
	socket.on("user:register", function(newUser, fn) {

		var currentUsernames = _.pluck(users, "name");
		if (!_.contains(currentUsernames, newUser)) {
			users.push(newUserNamed(newUser));

			io.sockets.emit("user:update", users);
			writeConfig(users, "users");
		}

		// Set the active user to this socket.
		var user = _.findWhere(users, {name: newUser});
		socket.user = user;

		fn(user);
	});

	// Retrieve a user for a particular UUID. The callback will return undefined 
	socket.on("user:uuid", function(userUUID, fn) {
		var user = _.findWhere(users, {uuid: userUUID});
		fn(user);
	});

	// When a user is updated, make sure to update the item in memory,
	// then broadcast the update to all other nodes.
	socket.on("user:update", function(updateUsers) {
		applyUpdatesToCollection(users, updateUsers, "uuid");

		socket.broadcast.emit("user:update", updateUsers);
		writeConfig(users, "users");
	});
});












// Category API
io.on('connection', function(socket){

	// When a category is updated, make sure to update the item in memory,
	// then broadcast the update to all other nodes.
	socket.on("category:update", function(updateCategories) {
		applyUpdatesToCollection(categories, updateCategories, "name");

		socket.broadcast.emit("category:update", updateCategories);
		writeConfig(categories, "categories");
	});


	socket.on("category:startCountdown", function(parameters) {

		console.log("Counting down for "+parameters.categoryName+". "+
			"Locking in "+parameters.secondsDelay+" seconds.");

		// Find the category with this name.
		var category = _.findWhere(categories, {name: parameters.categoryName});
		io.sockets.emit("category:startCountdown", parameters);

		setTimeout(function() {
			category.locked = true;
			io.sockets.emit("category:update", category);

			writeConfig(categories, "categories");
		}, parameters.secondsDelay /* seconds */ * 1000 /* milliseconds */);
	});
});










// Buzzer API
var buzzedUUIDs = [];
io.on('connection', function(socket) {

	// When a user buzzes in, mark them as buzzed.
	socket.on("buzzer:buzz", function(userUUID) {
		if (!_.contains(buzzedUUIDs, userUUID)) {
			buzzedUUIDs.push(userUUID);
		}
		io.sockets.emit("buzzer:allBuzzes", buzzedUUIDs);
	});

	socket.on("buzzer:unbuzz", function(userUUID) {
		buzzedUUIDs = _.without(buzzedUUIDs, userUUID);
		io.sockets.emit("buzzer:allBuzzes", buzzedUUIDs);
	});

	socket.on("buzzer:reset", function() {
		buzzedUUIDs = [];
		io.sockets.emit("buzzer:allBuzzes", buzzedUUIDs);
	});
});

// If the client requests the buzzes, give them the contents of this variable.
app.get('/config/buzzes.json', function(req, res) {
	res.json(buzzedUUIDs);
});










// TV API
io.on('connection', function(socket) {

	// When we receive an event to change the TV view rebroadcast it.
	socket.on("tv:QRString", function(QRString) {
		io.sockets.emit("tv:QRString", QRString);
	});

	socket.on("tv:viewName", function(viewName) {
		io.sockets.emit("tv:viewName", viewName);
	});

	socket.on("tv:networkInfo", function(networkInfo) {
		io.sockets.emit("tv:networkInfo", networkInfo);
	});

	socket.on("tv:category", function(category) {
		io.sockets.emit("tv:category", category);
	});

	socket.on("tv:leaderboardName", function(leaderboardName) {
		io.sockets.emit("tv:leaderboardName", leaderboardName);
	});
});














// Fire up the web server.
const PORT_NUMBER = userProperties.portNumber
var networkURLs = [];
http.listen(PORT_NUMBER, function(){

	// This logs all the IPs available on the current device.
	var os=require('os');
	var ifaces=os.networkInterfaces();
	var voterURL = "";
	
	networkURLs.push("http://localhost:"+PORT_NUMBER);
	for (var dev in ifaces) {
		var alias=0;
		ifaces[dev].forEach(function(details){
			if (details.family=='IPv4') {
				++alias;

				var thisURL = "http://"+details.address+":"+PORT_NUMBER;
				networkURLs.push(thisURL);

				if (details.address.startsWith("192")) {
					voterURL = thisURL;
				}
			}
		});
	}

	// =========================
	// Welcome message
	console.log("");
	console.log("The Oscars app is now running locally on port "+PORT_NUMBER+".");
	console.log("");
	console.log("Point your browser to one of these URLS to try it out:");
	networkURLs.forEach(function(urlString) {
		console.log("    "+urlString);
	});
	console.log("");

	console.log("The admin site is available at one of these URLs:");
	networkURLs.forEach(function(urlString) {
		console.log("    "+urlString+"/admin");
	});
	console.log("");

	console.log("The TV site is available at one of these URLs:");
	networkURLs.forEach(function(urlString) {
		console.log("    "+urlString+"/tv");
	});
	console.log("");

	console.log("To start, I recommend pointing your browser to the admin page. The admin password is \"oscarnight\"");
	console.log("");
});

app.get('/networkURLs.json', function(req, res) {
	res.json(networkURLs);
});









