var ipaddress = "172.20.10.3";

var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var path = require('path');
var fs = require('fs');

app.get('/', function(req, res) {
    var absolutePath = path.resolve('public/index.html');
    res.sendFile(absolutePath);
});

app.use(express.static('public'));

var tmp_count;

var clients = {};

var ORIENTATION = {
    HORIZONTAL: 0,
    VERTICAL: 1
}

var game = function(_s_id) {
    this.shooter_id = _s_id;
    this.victim_id = undefined;
    this.started = false;
    this.ended = false;
    this.full = false;
}

function check_hit(ship, x, y) {
    // top left => (0; 0)
    if (ship.orientation == ORIENTATION.VERTICAL) {
        // |||
        // from x and y, y increases
        if (ship.x == x && ship.y <= y && ship.y + ship.length > y) return true;
    } else {
        // ===
        // from x and y, x increases
        if (ship.y == y && ship.x <= x && ship.x + ship.length > x) return true;
    }
    return false;
}

var client_count = 0;


var games = [];
var game_count = 0;


function get_client_id(socket_id) {
    for (var c in clients) {
        if (clients[c].id == socket_id) return c;
    }
}

function init_game(socket_id) {
    clients[socket_id].game_id = game_count;
    if (games[game_count] == undefined) {
        games[game_count] = new game(socket_id);
    } else {
        games[game_count].victim_id = socket_id;
        games[game_count++].full = true;
    }
}

io.on('connection', function(socket) {
    console.log('a user connected with ID ' + socket.id);
    clients[socket.id] = {};
    clients[socket.id].id = socket.id;

    init_game(socket.id);

    socket.on('disconnect', function() {
        var game_id = clients[socket.id].game_id;
        games[game_id].ended = true;
        clients[socket.id] = undefined;
        console.log('user disconnected');
    });

    // Process:
    // register user
    // register stage
    // take turns
    //    - get shots

    socket.on('client_to_server ships', function(e) {
        var ships = JSON.parse(e);
        clients[socket.id].hitcount = 0;
        clients[socket.id].ships = ships;

        var game_id = clients[socket.id].game_id;
        if (games[game_id].ended == true) {
            init_game(socket.id);
            game_id = clients[socket.id].game_id;
        }

        if (games[game_id].started == true) {
            io.emit('start_game');

            io.to(games[game_id].shooter_id).emit('shooter');
            io.to(games[game_id].victim_id).emit('victim');

        } else {
            games[game_id].started = true;
        }
    });

    socket.on('client_to_server shots', function(e) {
        var bullets = JSON.parse(e);

        var results = [];

        var game_id = clients[socket.id].game_id;
        for (var i = 0; i < 3; i++) {
            var bullet = bullets[i];
            var tmp_ship = undefined;
            for (var ship in clients[games[game_id].victim_id].ships) {
                var _ship = clients[games[game_id].victim_id].ships[ship];
                var res = check_hit(_ship, bullet.x, bullet.y);
                if (res == true) {
                    tmp_ship = _ship;
                }
            }
            results[i] = {
                bullet: bullet,
                result: (tmp_ship != undefined),
                style: (tmp_ship != undefined) ? tmp_ship.style : 'white'
            };
            if (tmp_ship != undefined) clients[games[game_id].victim_id].hitcount++;
        }

        io.emit('server_to_client shots', JSON.stringify(results));
        if (clients[games[game_id].victim_id].hitcount == 17) {
            // victim has lost the game
            io.to(games[game_id].victim_id).emit('server_to_client ships', JSON.stringify(clients[games[game_id].shooter_id].ships));
            io.to(games[game_id].shooter_id).emit('server_to_client ships', JSON.stringify(clients[games[game_id].victim_id].ships));
            games[game_id].started = false;
        } else {
            // swop shooter and victim

            var keep = games[game_id].shooter_id;
            games[game_id].shooter_id = games[game_id].victim_id;
            games[game_id].victim_id = keep;
            // next round
            io.to(games[game_id].shooter_id).emit('shooter');
            io.to(games[game_id].victim_id).emit('victim');
        }
    });
});


var port = 3000;
http.listen(port, ipaddress, function() {
    console.log('listening on ' + ipaddress + ":" + port);
});
