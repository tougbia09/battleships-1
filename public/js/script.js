var game_started = false;

var canvas = document.getElementById('map');
var context = canvas.getContext('2d');

var ORIENTATION = {
    HORIZONTAL: 0,
    VERTICAL: 1
}

var STATE = {
    PLACEMENT: 0,
    WAITING: 1,
    VICTIM: 2,
    SHOOTER: 3,
    ENDED: 4
}

var ROLE = {
    VICTIM: 0,
    SHOOTER: 1
}

var game_state = STATE.ENDED;
var game_role = ROLE.VICTIM;
var attacks = [];

var game_over = false;

var socket = io();

var error = false;

// ships
function ship(x, y, length, orientation, style) {
    this.x = x;
    this.y = y;
    this.length = length;
    this.orientation = orientation;
    this.style = style;

    this.check_hit = function(x, y) {
        // top left => (0; 0)
        if (this.orientation == ORIENTATION.VERTICAL) {
            // |||
            // from x and y, y increases
            if (this.x == x && this.y <= y && this.y + this.length > y) return true;
        } else {
            // ===
            // from x and y, x increases
            if (this.y == y && this.x <= x && this.x + this.length > x) return true;
        }
        return false;
    }
}


var ships = {};

var shots = [];

var marked_ship = undefined;
var _marked_ship = undefined;

var block = {};

var hatched;
var hatched_color;

var bullet_index = 0;
var bullets = [];

var invalid_ships = undefined;

$(window).load(function() {
    create_hatched_pattern();
    create_hatched_pattern('red');
});

function create_hatched_pattern(color) {
    if (color == undefined) {
        hatched = document.createElement('canvas');
        hatched.height = 44;
        hatched.width = 44;
    } else {
        hatched_color = document.createElement('canvas');
        hatched_color.height = 44;
        hatched_color.width = 44;
    }
    var p_ctx = color == undefined ? hatched.getContext('2d') : hatched_color.getContext('2d');
    p_ctx.strokeStyle = color == undefined ? '#111' : color;
    p_ctx.lineWidth = 1;
    p_ctx.beginPath();

    for (var i = 0; i < 22; i++) {
        p_ctx.moveTo(0, (i - 11) * 4);
        p_ctx.lineTo(44, (i) * 4);

        p_ctx.moveTo((i - 11) * 4, 44);
        p_ctx.lineTo((i) * 4, 0);
    }
    p_ctx.stroke();
}

$('#btn_accept').on('click', function() {
    if (error) return;
    if (game_state == STATE.ENDED) {
        game_state = STATE.PLACEMENT;
        game_over = false;
        // init ships
        initialize_ships();
        // clear shots
        clear_shots();
        // place ships
        redraw_map();
        $('#btn_accept').html('ACCEPT PLACEMENT');
        $('#btn_place').removeClass('disable');
        randomize_ships();

    } else if (game_state == STATE.PLACEMENT) {
        if (validate_ship_positions() == false) return;

        game_state = STATE.WAITING;
        $('#btn_place').addClass('disable');
        $('#btn_rotate').addClass('disable');
        _marked_ship = undefined;
        marked_ship = undefined;
        redraw_map();
        // start the game
        if (socket != undefined) {
            define_sockets();
            socket.emit('client_to_server ships', JSON.stringify(ships));
            $('#btn_accept').html('WAITING...');
            clear_attacks();
        } else {
            error = true;
            $('#btn_accept').html('CANNOT CONNECT');
        }
    } else if (game_state == STATE.SHOOTER) {
        // submit shots to sever
        game_state = STATE.WAITING;
        $('#btn_accept').addClass('disable');
        socket.emit('client_to_server shots', JSON.stringify(bullets));
    }
});

function initialize_ships() {
    ships = {
        carrier: new ship(1, 1, 5, 0, 'aqua'),
        battleship: new ship(2, 2, 4, 1, 'blue'),
        submarine: new ship(3, 3, 3, 0, 'yellow'),
        cruiser: new ship(4, 4, 3, 0, 'orange'),
        destroyer: new ship(4, 5, 2, 0, 'purple')
    }
}

function validate_ship_positions() {
    var result = true;
    invalid_ships = [];
    var index = 0;
    for (var s in ships) {
        console.log('checking ' + s);
        if (is_valid_placement(ships[s], s) == false) {
            invalid_ships[index++] = s;
            result = false;
        }
    }
    if (result == false) {
        mark_invalid_ships();
    }
    return result;
}

function mark_invalid_ships() {
    if (invalid_ships != undefined) {
        console.log(invalid_ships);
        for (var i of invalid_ships) {
            var _ship = ships[i];

            mark_ship(_ship.x, _ship.y);
            display_marked_ship('red');
        }
        marked_ship = undefined;
        _marked_ship = undefined;
    }
}

function define_sockets() {

    socket.on('start_game', function() {
        console.log('game started');
        $('#btn_accept').addClass('disable');
        window.setTimeout(function() { display_role() }, 300);
    });

    socket.on('shooter', function() {
        console.log('state changed: shooter');
        game_state = STATE.SHOOTER;
        game_role = ROLE.SHOOTER;
    });

    socket.on('victim', function() {
        console.log('state changed: victim');
        game_state = STATE.VICTIM;
        game_role = ROLE.VICTIM;
    });

    socket.on('server_to_client shots', function(e) {
        var _tmp = JSON.parse(e);
        for (var _shot of _tmp) {
            if (game_role == ROLE.SHOOTER) {
                // add to attacks
                attacks[_shot.bullet.x][_shot.bullet.y] = {
                    shot: true,
                    style: _shot.style
                };
            } else {
                // add to shots
                shots[_shot.bullet.x][_shot.bullet.y] = true;
            }
        }
        display_role();
        window.setTimeout(function() { display_role() }, 3000);
    });

    socket.on('server_to_client ships', function(e) {
        ships = JSON.parse(e);
        game_role = ROLE.VICTIM;
        game_over = true;
    });

}

function display_role() {
    console.log('game_role: ' + game_role);
    if (game_role == ROLE.SHOOTER) {
        $('#btn_accept').html('SHOOT');
        bullet_index = 0;
        redraw_shots();
    } else {
        $('#btn_accept').html('WAITING...');
        redraw_map();
    }

    if (game_over == true) {
        context.font = "30px Arial";
        var line1 = 'GAME';
        var line2 = 'OVER';
        for (var i = 0; i < 4; i++) {
            context.fillStyle = 'rgba(0, 255, 0, 0.6)';
            context.fillRect(__c(3 + i), __c(4), 40, 40);
            context.fillRect(__c(3 + i), __c(5), 40, 40);

            context.fillStyle = 'black';
            context.fillText(line1[i],  __c(3 + i) + 8, __c(4) + 30);
            context.fillText(line2[i],  __c(3 + i) + 8, __c(5) + 30);
        }
        game_started = false;
        game_state = STATE.ENDED;
        $('#btn_accept').html('CLICK TO START');
        $('#btn_accept').removeClass('disable');
    }
}


$('#btn_rotate').on('click', function() {
    if (marked_ship == undefined || _marked_ship == undefined || $(this).hasClass('disabled')) return;
    // rotate the selected vessel
    _marked_ship.orientation = _marked_ship.orientation == ORIENTATION.VERTICAL ? ORIENTATION.HORIZONTAL : ORIENTATION.VERTICAL;
    if (_marked_ship.orientation == ORIENTATION.VERTICAL) {
        if (_marked_ship.y > (10 - _marked_ship.length)) {
            _marked_ship.y = 10 - _marked_ship.length
        }
    } else {
        if (_marked_ship.x > (10 - _marked_ship.length)) {
            _marked_ship.x = 10 - _marked_ship.length
        }
    }

    set_marked_ship();

    console.log('rotating');

    redraw_map();
});

$('#btn_place').on('click', function() {
    _marked_ship = undefined;
    marked_ship = undefined;
    // randomize_ships
    randomize_ships();
});

$('#map').on('mousedown', function(e) {
    map_down(e);
});

$('#map').on('mousemove', function(e) {
    map_move(e);
});

$(document).on('mouseup', function(e) {
    map_up(e);
});
//
// $('#map').on('touchstart', function(e) {
//     map_down(e);
// });
//
// $('#map').on('touchmove', function(e) {
//     e.preventDefault();
//     map_move(e);
// });
//
// $(document).on('touchend', function(e) {
//     map_up(e);
// });

function map_down(e) {
    block = get_block(e.offsetX, e.offsetY);
    console.log('Map down on ' + block.x + ' ' + block.y);
    if (block == undefined) {
        return;
    }
    if (game_state == STATE.PLACEMENT) {
        if (check_hit(block.x, block.y) == true) {
        // mark ship
        mark_ship(block.x, block.y);
        } else {
            _marked_ship = undefined;
            marked_ship = undefined;
        }
        redraw_map();
    } else if (game_state == STATE.SHOOTER) {
        var x = block.x;
        var y = block.y;
        if (attacks[x][y].shot == true) return;
        if (!is_shot(block)) {
            $('#bullet_' + bullet_index).css({ top: 20 + __c(y) + 'px', left: 20 + __c(x) + 'px', display: 'block' });
            bullets[bullet_index] = block;
            bullet_index++;
            if (bullet_index == 3) bullet_index = 0;
            check_shoot_ready();
        } else {
            hide_bullet(x, y);
        }
    }
}

$('[id^=bullet_]').click(function(e) {
    block = get_block(e.target.offsetLeft, e.target.offsetTop);
    hide_bullet(block.x, block.y);
});

function __c(a) {
    return 46 + a * 44;
}

function is_shot(block) {
    for (var i = 0; i < 3; i++) {
        if (bullets[i] == undefined) continue;
        if (bullets[i].x == block.x && bullets[i].y == block.y) return true;
    }
    return false;
}

function hide_bullet(x, y) {
    for (var i = 0; i < 3; i++) {
        if (bullets[i] == undefined) continue;
        if (bullets[i].x == x && bullets[i].y == y) {
            bullets[i] = undefined;
            $('#bullet_' + i).css('display', 'none');
            bullet_index = i;
        }
    }
    check_shoot_ready();
}

function clear_attacks() {
    for (var x = 0; x < 10; x++) {
        attacks[x] = [];
        for (var y = 0; y < 10; y++) {
            attacks[x][y] = {
                shot: false,
                style: ''
            }
        }
    }
}

function check_shoot_ready() {
    var ready = true;
    for (var b = 0; b < 3; b++) {
        if (bullets[b] == undefined) ready = false;
    }
    if (ready) {
        $('#btn_accept').removeClass('disable');
    } else {
        $('#btn_accept').addClass('disable');
    }
}

function set_marked_ship() {
    marked_ship = {
        x_1: _marked_ship.x,
        y_1: _marked_ship.y
    }
    if (_marked_ship.orientation == ORIENTATION.VERTICAL) {
        // |||
        marked_ship.x_2 = _marked_ship.x;
        marked_ship.y_2 = _marked_ship.y + _marked_ship.length - 1;
    } else {
        // ===
        marked_ship.x_2 = _marked_ship.x + _marked_ship.length - 1;
        marked_ship.y_2 = _marked_ship.y;
    }
}

function map_move(e) {
    if (game_state != STATE.PLACEMENT) return;
    if (block == undefined) return;
    var _block = get_block(e.offsetX, e.offsetY);
    if (_block == undefined) return;
    if (marked_ship != undefined) {
        if (_block.x != block.x || _block.y != block.y) {
            console.log('redrawing');
            // mark_moved = true;
            move_marked_ship(_block.x - block.x, _block.y - block.y);
            block = _block;
            redraw_map();
        }
    }
}

function map_up(e) {
    if (game_state != STATE.PLACEMENT) return;
    block = undefined;
    if (marked_ship != undefined && _marked_ship != undefined) {
        $('#btn_rotate').removeClass('disable');
    } else {
        $('#btn_rotate').addClass('disable');
        marked_ship = undefined;
        _marked_ship = undefined;
    }
    redraw_map();
}

function mark_ship(x, y) {
    console.log('marking ship at ' + x + ' ; ' + y);
    marked_ship = undefined;
    for (var s in ships) {
        var _ship = ships[s];
        if (_ship.check_hit(x, y)) {
            _marked_ship = _ship;
            set_marked_ship();
            break;
        }
    }
}

function move_marked_ship(dx, dy) {
    if (_marked_ship.x + dx >= 0)
    {
        if (_marked_ship.orientation == ORIENTATION.HORIZONTAL)
        {
            // ===
            if (_marked_ship.x + _marked_ship.length + dx <= 10)
            {
                _marked_ship.x += dx;
            }
        } else {
            // |||
            if (_marked_ship.x + dx < 10)
            {
                _marked_ship.x += dx;
            }
        }
    }
    if (_marked_ship.y + dy >= 0)
    {
        if (_marked_ship.orientation == ORIENTATION.VERTICAL)
        {
            // |||
            if (_marked_ship.y + _marked_ship.length + dy <= 10)
            {
                _marked_ship.y += dy;
            }
        } else {
            // ===
            if (_marked_ship.y + dy < 10)
            {
                _marked_ship.y += dy;
            }
        }
    }
    set_marked_ship();
    return;
}

function get_block(x, y) {
    if (x < 44 || y < 44) {
        return undefined;
    }
    if (x > 484 || y > 484) {
        return undefined;
    }
    x -= 44;
    y -= 44;
    return {
        x: Math.floor(x / 44),
        y: Math.floor(y / 44)
    }
}

function clear_shots() {
    for (var x = 0; x < 10; x++) {
        shots[x] = [];
        for (var y = 0; y < 10; y++) {
            shots[x][y] = false;
        }
    }
}

function redraw_map() {
    draw_grids();
    draw_ships();
    if (game_over == false)
        draw_shots();
    else draw_bullets();
}

function redraw_shots() {
    hide_bullets();
    draw_grids();
    draw_bullets();
}

function hide_bullets() {
    for (var i = 0; i < 3; i++) {
        $('#bullet_' + i).css('display', 'none');
    }
}

function draw_grids() {
    context.fillStyle = 'darkgreen';
    context.fillRect(0, 0, 484, 484);
    context.font = "16px Arial";
    context.fillStyle = 'lime';
    for (var i = 1; i <= 10; i++) {
        context.fillText(i,  15, ((i + 1) * 44) - 15);
        context.fillText(String.fromCharCode(64 + i), (i + 1)*44 - 30, 25);
    }
    context.strokeStyle = "lime";
    for (var i = 1; i <= 11; i++)
    {
        context.beginPath();
        context.moveTo(i * 44, 44);
        context.lineTo(i * 44, 484);

        context.moveTo(44, i * 44);
        context.lineTo(484, i * 44);
        context.stroke();
    }
}

function draw_ships() {
    for (var s in ships) {

        var _ship = ships[s];
        context.fillStyle = _ship.style;

        for (var l = 0; l < _ship.length; l++) {
            var x = _ship.x;
            var y = _ship.y;
            if (_ship.orientation == ORIENTATION.VERTICAL) {
                y = y + l;
            } else {
                x = x + l;
            }
            fill_block(x, y);
        }
    }

    display_marked_ship();
}

function display_marked_ship(color) {
    if (marked_ship != undefined) {
        var x_1 = __c(marked_ship.x_1) - 3;
        var y_1 = __c(marked_ship.y_1) - 3;
        var width = __c(marked_ship.x_2 - marked_ship.x_1);
        var height = __c(marked_ship.y_2 - marked_ship.y_1);

        context.fillStyle = context.createPattern(color == undefined ? hatched : hatched_color, 'repeat');
        context.fillRect(x_1, y_1, width, height);
    }
}

function draw_shots() {
    for (var x = 0; x < 10; x++) {
        for (var y = 0; y < 10; y++) {
            if (shots[x][y] == true) {
                fill_shot(__c(x), __c(y), check_hit(x, y));
            }
        }
    }
}

function draw_bullets() {
    for (var x = 0; x < 10; x++) {
        for (var y = 0; y < 10; y++) {
            if (attacks[x][y].shot == true) {
                var style = attacks[x][y].style;
                if (style != '' && style != 'white' && game_over == true) style = 'red';
                fill_shot(__c(x), __c(y), style != '', style);
            }
        }
    }
}

function check_hit(x, y) {
    for (var s in ships)
    {
        if (ships[s].check_hit != undefined && ships[s].check_hit(x, y) == true) return true;
    }
    return false;
}

function fill_shot(_x, _y, hit, color) {
    context.beginPath();
    if (hit == true) {
        if (color != undefined)
            context.fillStyle = color;
        else
            context.fillStyle = "red";
    } else {
        context.fillStyle = "white";
    }
    context.arc(_x + 20 , _y + 20, 10, 0, 2 * Math.PI);
    context.fill();
    context.strokeStyle = "black";
    context.beginPath();
    context.arc(_x + 20 , _y + 20, 10, 0, 2 * Math.PI);
    context.stroke();
}

function fill_block(x, y) {
    context.fillRect(__c(x), __c(y), 40, 40);
}

function randomize_ships() {
    // move all ships out of the screen
    for (var s in ships) {
        var _ship = ships[s];
        _ship.x = -1;
        _ship.y = -1;
    }

    for (var s in ships) {
        var _ship = ships[s];
        var tmp = [];
        tmp.x = -1;
        tmp.y = -1;
        tmp.length = _ship.length;
        tmp.orientation = 0;
        while (is_valid_placement(tmp, s) == false) {
            tmp.x = Math.floor(Math.random() * 10);
            tmp.y = Math.floor(Math.random() * 10);
            tmp.orientation = Math.floor(Math.random() * 2);
        }
        _ship.x = tmp.x;
        _ship.y = tmp.y;
        _ship.orientation = tmp.orientation;
    }
    redraw_map();
}

function is_valid_placement(ship, _s) {
    if (ship.x < 0 || ship.x > 9) return false;
    if (ship.y < 0 || ship.y > 9) return false;

    if (ship.orientation == ORIENTATION.VERTICAL) {
        if (ship.y + ship.length > 10) return false;
    } else {
        if (ship.x + ship.length > 10) return false;
    }
    for (var s in ships) {
        if (s != _s) {
            var _ship = ships[s];
            if (ship.orientation == ORIENTATION.VERTICAL) {
                var y_i = ship.y - 1;
                var y_f = ship.y + ship.length;

                for (var y = y_i; y <= y_f; y++) {
                    for (var x = ship.x - 1; x <= ship.x + 1; x++) {
                        if (x == ship.x && !(y == y_i || y == y_f)) {
                            continue;
                        }
                        if (check_hit(x, y)) {
                            return false;
                        }
                    }
                }
            } else {
                var x_i = ship.x - 1;
                var x_f = ship.x + ship.length;

                for (var x = x_i; x <= x_f; x++) {
                    for (var y = ship.y - 1; y <= ship.y + 1; y++) {
                        if (y == ship.y && !(x == x_i || x == x_f)) {
                            continue;
                        }
                        if (check_hit(x, y)) {
                            return false;
                        }
                    }
                }
            }
        }
    }
    return true;
}