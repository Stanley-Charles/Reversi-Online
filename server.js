/********************************/
/* Set up the static file server*/
let static = require('node-static');

/* Set up the http server library */
let http = require('http');

/* Assume that we're running on Heroku */
let port = process.env.PORT;
let directory = __dirname + '/public';

/* If we're not on heroku, adjust our port and directory */
if ((typeof port == 'undefined') || (port === null)) {
    port = 8080;
    directory = './public';
}

/* Set up our static file web server to deliver files from the filesystem */
let file = new static.Server(directory);

let app = http.createServer(
    function(request, response) {
        request.addListener('end',
            function() {
                file.serve(request, response);
            }
        ).resume(); 
    }
).listen(port);

console.log('The server is running');


/********************************/
/* Set up the web socket server*/

/* set up a registry of player info and socket ids */
let players = [];

const { Server } = require("socket.io");
const io = new Server(app);

io.on('connection', (socket) => {

    /* Output a log message on the server and send it to the client */
    function serverLog(...messages) {
        io.emit('log',['**** Message from the server:\n']);
        messages.forEach((item) => {
            io.emit('log', ['****\t'+item]);
            console.log(item);
        });
    }

    serverLog('a page connected to the server:' +socket.id);

    


    /* join_room command handler */
    /* expected payload: 
        {
            'room': the room to be joined,
            'username': the name of the user joining the room
        }
    */
    /* join_room_response:
        {
            'result': 'success',
            'room': room that was joined,
            'username': the user that joined the room,
            'count': the number of users in the chat room
            'socket_id': the socket of user that joined the room 
        }
    or
        {
            'result': 'fail',
            'message': the reason for failure
        }
    */    

    socket.on('join_room', (payload) => {
        serverLog('Server received a command', '\'join_room\'',JSON.stringify(payload));
        /* Check that the data coming from the client is good */
        if ((typeof payload == 'undefined') || (payload === null)) {
            response = {};
            response.result = 'fail';
            response.message = 'client did not send a payload';
            socket.emit('join_room_reseponse',response);
            serverLog('join_room_command fialed', JSON.stringify(response));
            return;
        }
        let room = payload.room;
        let username = payload.username;
        if ((typeof room == 'undefined') || (room === null)) {
            response = {};
            response.result = 'fail';
            response.message = 'client did not send a valid room to join';
            socket.emit('join_room_reseponse',response);
            serverLog('join_room_command fialed', JSON.stringify(response));
            return;
        }
        if ((typeof username == 'undefined') || (username === null)) {
            response = {};
            response.result = 'fail';
            response.message = 'client did not send a valid username to join chat room';
            socket.emit('join_room_reseponse',response);
            serverLog('join_room_command fialed', JSON.stringify(response));
            return;
        }

        /* Handle the command */
        socket.join(room);

        /* Make sure the client was put in the room */
        io.in(room).fetchSockets().then((sockets)=> {
            /* Socket didn't joined the room */
            if ((typeof sockets == 'undefined') || (sockets === null) || !sockets.includes(socket)) {
                response = {};
                response.result = 'fail';
                response.message = 'Server internal error joining chat room';
                socket.emit('join_room_reseponse',response);
                serverLog('join_room_command failed', JSON.stringify(response));
            } 
            /* Socket did join the room */
            else{
                players[socket.id] = {
                    username: username,
                    room: room
                }
                /* Announce to everyone that is in the room who else in the room */
                for (const member of sockets) {
                    response = {
                        result: 'success',
                        socket_id: member.id,
                        room: players[member.id].room,
                        username: players[member.id].username,
                        count: sockets.length
                    }
                    /* Tell everyone that a new user has joined the chat room */
                    io.of('/').to(room).emit('join_room_response', response);
                    serverLog('join_room succeeded', JSON.stringify(response));
                    if(room !== "Lobby") {
                        send_game_update(socket, room, 'initial update' );
                    }
                } 
            }
        });
    });


    socket.on('invite', (payload) => {
        serverLog('Server received a command', '\'invite\'',JSON.stringify(payload));
        /* Check that the data coming from the client is good */
        if ((typeof payload == 'undefined') || (payload === null)) {
            response = {};
            response.result = 'fail';
            response.message = 'client did not send a payload';
            socket.emit('invite_reseponse',response);
            serverLog('invite command failed', JSON.stringify(response));
            return;
        }
        let requested_user = payload.requested_user;
        let room = players[socket.id].room;
        let username = players[socket.id].username;
        if ((typeof requested_user == 'undefined') || (requested_user === null) || (requested_user === "")) {
            response = {
                result: 'fail',
                message: 'client did not request a valid username to invite'
            }
            socket.emit('invite_response',response);
            serverLog('invite command fialed', JSON.stringify(response));
            return;
        }
        if ((typeof room == 'undefined') || (room === null) || (room === "")) {
            response = {
                result: 'fail',
                message: 'user that was invited is not in a valid room'
            }
            socket.emit('invite_response',response);
            serverLog('invite command failed', JSON.stringify(response));
            return;
        }
        if ((typeof username == 'undefined') || (username === null) || (username === "")) {
            response = {
                result: 'fail',
                message: 'user that was invited dpes not have a name registered'
            }
            socket.emit('invite_response',response);
            serverLog('invite command fialed', JSON.stringify(response));
            return;
        }

        /* Make sure the invited player is present */
        io.in(room).allSockets().then((sockets)=> {
            /* Invitee didn't joined the room */
            if ((typeof sockets == 'undefined') || (sockets === null) || !sockets.has(requested_user)) {
                response = {
                    result: 'fail',
                    message: 'the user that was invited is no longer in the room'
                }
                socket.emit('invite_response',response);
                serverLog('invite command fialed', JSON.stringify(response));
                return;
            } 
            /* Invitee is in the room */
            else{
                response = {
                    result: 'success',
                    socket_id: requested_user
                }      
                socket.emit("invite_response", response);

                response = {
                    result: 'success',
                    socket_id: socket.id
                }
                socket.to(requested_user).emit("invited", response);
                serverLog('invite command succeeded', JSON.stringify(response));

    
            }
        });
    });

    socket.on('uninvite', (payload) => {
        serverLog('Server received a command', '\'uninvite\'',JSON.stringify(payload));
        /* Check that the data coming from the client is good */
        if ((typeof payload == 'undefined') || (payload === null)) {
            response = {};
            response.result = 'fail';
            response.message = 'client did not send a payload';
            socket.emit('uninvited',response);
            serverLog('uninvite command failed', JSON.stringify(response));
            return;
        }
        let requested_user = payload.requested_user;
        let room = players[socket.id].room;
        let username = players[socket.id].username;
        if ((typeof requested_user == 'undefined') || (requested_user === null) || (requested_user === "")) {
            response = {
                result: 'fail',
                message: 'client did not request a valid username to uninvite'
            }
            socket.emit('uninvited',response);
            serverLog('uninvite command fialed', JSON.stringify(response));
            return;
        }
        if ((typeof room == 'undefined') || (room === null) || (room === "")) {
            response = {
                result: 'fail',
                message: 'user that was uninvited is not in a valid room'
            }
            socket.emit('uninvited',response);
            serverLog('uninvite command failed', JSON.stringify(response));
            return;
        }
        if ((typeof username == 'undefined') || (username === null) || (username === "")) {
            response = {
                result: 'fail',
                message: 'user that was uninvited does not have a name registered'
            }
            socket.emit('uninvited',response);
            serverLog('uninvite command fialed', JSON.stringify(response));
            return;
        }

        /* Make sure the invited player is present */
        io.in(room).allSockets().then((sockets)=> {
            /* Uninvited didn't joined the room */
            if ((typeof sockets == 'undefined') || (sockets === null) || !sockets.has(requested_user)) {
                response = {
                    result: 'fail',
                    message: 'the user that was uninvited is no longer in the room'
                }
                socket.emit('uninvited',response);
                serverLog('uninvite command failed', JSON.stringify(response));
                return;
            } 
            /* Uinvitee is in the room */
            else{
                response = {
                    result: 'success',
                    socket_id: requested_user
                }      
                socket.emit("uninvited", response);

                response = {
                    result: 'success',
                    socket_id: socket.id
                }
                socket.to(requested_user).emit("uninvited", response);
                serverLog('uninvite command succeeded', JSON.stringify(response));

    
            }
        });
    });

    socket.on('game_start', (payload) => {
        serverLog('Server received a command', '\'game_start\'',JSON.stringify(payload));
        /* Check that the data coming from the client is good */
        if ((typeof payload == 'undefined') || (payload === null)) {
            response = {};
            response.result = 'fail';
            response.message = 'client did not send a payload';
            socket.emit('game_start_response',response);
            serverLog('game_start command failed', JSON.stringify(response));
            return;
        }
        let requested_user = payload.requested_user;
        let room = players[socket.id].room;
        let username = players[socket.id].username;
        if ((typeof requested_user == 'undefined') || (requested_user === null) || (requested_user === "")) {
            response = {
                result: 'fail',
                message: 'client did not request a valid username to engage'
            }
            socket.emit('game_start_response',response);
            serverLog('game_start command fialed', JSON.stringify(response));
            return;
        }
        if ((typeof room == 'undefined') || (room === null) || (room === "")) {
            response = {
                result: 'fail',
                message: 'user that was engaged is not in a valid room'
            }
            socket.emit('game_start_response',response);
            serverLog('game_start command failed', JSON.stringify(response));
            return;
        }
        if ((typeof username == 'undefined') || (username === null) || (username === "")) {
            response = {
                result: 'fail',
                message: 'user that was engaged to play does not have a name registered'
            }
            socket.emit('game_start_response',response);
            serverLog('game_start command fialed', JSON.stringify(response));
            return;
        }

        /* Make sure the engaged player is present */
        io.in(room).allSockets().then((sockets)=> {
            /* Engaged player didn't joined the room */
            if ((typeof sockets == 'undefined') || (sockets === null) || !sockets.has(requested_user)) {
                response = {
                    result: 'fail',
                    message: 'the user that was engaged is no longer in the room'
                }
                socket.emit('game_start_response',response);
                serverLog('game_start command failed', JSON.stringify(response));
                return;
            } 
            /* Engaged player is in the room */
            else{
                let game_id = Math.floor(1 + Math.random() * 0x100000).toString(16);
                response = {
                    result: 'success',
                    game_id: game_id,
                    socket_id: requested_user
                }      
                socket.emit("game_start_response", response);
                socket.to(requested_user).emit("game_start_response", response);
                serverLog('game_start command succeeded', JSON.stringify(response));

    
            }
        });
    });

    socket.on('disconnect', () => {
        serverLog('a page disconnected from the server:' +socket.id);
        if((typeof players[socket.id] != 'undefined') && (players[socket.id] != null)) {
            let payload = {
                username: players[socket.id].username,
                room: players[socket.id].room,
                count: Object.keys(players).length -1,
                socket_id: socket.id
            };
            let room = players[socket.id].room;
            delete players[socket.id];
            /* Tell everyone who left the room */
            io.of("/").to(room).emit('player_disconnected', payload);
            serverLog('player_disconnected succeeeded ', JSON.stringify(payload));
        }
    });

    /* send_chat_message command handler */
    /* expected payload: 
        {
            'room': the room to which message should be sent,
            'username': the name of the sender 
            'message': the message to broadcast
        }
    */
    /* send_chat_message_response:
        {
            'result': 'success',
            'username': the user that sent the message,
            'message': the message the user sent
        }
    or
        {
            'result': 'fail',
            'message': the reason for failure
        }
    */    


    socket.on('send_chat_message', (payload) => {
        serverLog('Server received a command', '\'send_chat_message\'',JSON.stringify(payload));
        /* Check that the data coming from the client is good */
        if ((typeof payload == 'undefined') || (payload === null)) {
            response = {};
            response.result = 'fail';
            response.message = 'client did not send a payload';
            socket.emit('send_chat_message_response',response);
            serverLog('send_chat_message command failed', JSON.stringify(response));
            return;
        }
        let room = payload.room;
        let username = payload.username;
        let message = payload.message;
        if ((typeof room == 'undefined') || (room === null)) {
            response = {};
            response.result = 'fail';
            response.message = 'client did not send a valid room to message';
            socket.emit('send_chat_message_response',response);
            serverLog('send_chat_message command failed', JSON.stringify(response));
            return;
        }
        if ((typeof username == 'undefined') || (username === null)) {
            response = {};
            response.result = 'fail';
            response.message = 'client did not send a valid username as a message source';
            socket.emit('send_chat_message_response',response);
            serverLog('send_chat_message command failed', JSON.stringify(response));
            return;
        }
        if ((typeof message == 'undefined') || (message === null)) {
            response = {};
            response.result = 'fail';
            response.message = 'client did not send a valid message';
            socket.emit('send_chat_message_response',response);
            serverLog('send_chat_message command failed', JSON.stringify(response));
            return;
        }
    
        /* Handle the command */
        let response = {};
        response.result = 'success';
        response.username = username;
        response.room   = room;
        response.message = message;
        /* Tell everyone in the room the message */
        io.of('/').to(room).emit('send_chat_message_response', response);
        serverLog('send_chat_message command succeeded', JSON.stringify(response));
        });
});


/*********************************************/
   /*Code related to game state*/

 let games = [];

 function create_new_game() {
    let new_game = {};
    new_game.player_white = {};
    new_game.player_white.socket = "";
    new_game.player_white.username = "";
    new_game.player_black = {};
    new_game.player_black.socket = "";
    new_game.player_black.username = "";

    var d = new Date();
    new_game.last_move_time = d.getTime();

    new_game.whose_turn = 'white';

    new_game.board = [
        [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
        [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
        [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
        [' ', ' ', ' ', 'w', 'b', ' ', ' ', ' '],
        [' ', ' ', ' ', 'b', 'w', ' ', ' ', ' '],
        [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
        [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
        [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ']
    ];

    return new_game;
 }

function send_game_update(socket, game_id, message) {
    /* Check to see if a game with game_id exists */
    /* Make sure that only 2 people are in the room */
    /* Assign this socket a color */
    /* Send game update */
    /* Check if the game is over */

    /* Check to see if a game with game_id exists */
    if((typeof games[game_id] == 'undefined') || (games[game_id] === null )) {
        console.log("No game exists with game_id:"+game_id+". Making a new game for "+socket.id);
        games[game_id] = create_new_game();
    }

    /* Send game update */

    let payload = {
        result: 'success',
        game_id: game_id,
        game: games[game_id],
        message: message
    }
    io.of("/").to(game_id).emit('game_update', payload);




}