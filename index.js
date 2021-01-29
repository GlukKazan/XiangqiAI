"use strict";

const ai = require('./xiangqi-ai');
const axios = require('axios');
const _ = require('underscore');

const STATE = {
    STRT: 0,
    INIT: 1,
    TURN: 2,
    MOVE: 3,
    CHCK: 4,
    SESS: 5,
    WAIT: 6,
    STOP: 7,
    RECO: 8,
    GETM: 9
};

const SERVICE  = 'http://127.0.0.1:3000';
const USERNAME = 'xiangqiai';
const PASSWORD = 'xiangqiai';

const MAX_SESSIONS   = 3;
const MIN_SESSIONS   = 0;
const MIN_AI_TIMEOUT = 9000;
const MAX_AI_TIMEOUT = 10000;

let TOKEN    = null;
let sid      = null;
let uid      = null;
let setup    = null;
let turn     = null;
let openings = [];
let timeout  = null;

var winston = require('winston');
require('winston-daily-rotate-file');

const logFormat = winston.format.combine(
    winston.format.timestamp({
        format: 'HH:mm:ss'
    }),
    winston.format.printf(
        info => `${info.level}: ${info.timestamp} - ${info.message}`
    )
);

var transport = new winston.transports.DailyRotateFile({
    dirname: '',
    filename: 'xiangqiai-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '14d'
});

var logger = winston.createLogger({
    format: logFormat,
    transports: [
      transport
    ]
});

function App() {
    this.state  = STATE.INIT;
    this.states = [];
}

let app = new App();

let loadDebuts = function(app) {
    console.log('STRT');
    logger.info('STRT');
    app.state = STATE.WAIT;
    axios.get(SERVICE + '/api/game/openings/7')
    .then(function (response) {
        _.each(response.data, (x) => {
            openings.push(x);
        });
        app.state = STATE.INIT;
      })
      .catch(function (error) {
        console.log('STRT ERROR: ' + error);
        logger.error('STRT ERROR: ' + error);
        app.state  = STATE.STOP;
      });
  
    return true;
}

let init = function(app) {
    console.log('INIT');
    logger.info('INIT');
    app.state = STATE.WAIT;
    axios.post(SERVICE + '/api/auth/login', {
        username: USERNAME,
        password: PASSWORD
    })
    .then(function (response) {
      TOKEN = response.data.access_token;
      app.state = STATE.TURN;
    })
    .catch(function (error) {
      console.log('INIT ERROR: ' + error);
      logger.error('INIT ERROR: ' + error);
      app.state  = STATE.STOP;
    });
    return true;
}

let recovery = function(app) {
//  console.log('RECO');
    app.state = STATE.WAIT;
    axios.post(SERVICE + '/api/session/recovery', {
        id: sid,
        setup_required: true
    }, {
        headers: { Authorization: `Bearer ${TOKEN}` }
    })
    .then(function (response) {
        console.log(response.data);
        uid = response.data.uid;
        timeout = response.data.ai_timeout;
        app.state = STATE.GETM;
      })
      .catch(function (error) {
        console.log('RECO ERROR: ' + error);
        logger.error('RECO ERROR: ' + error);
        app.state  = STATE.INIT;
      });
      return true;
}

let getConfirmed = function(app) {
    console.log('GETM');
    app.state = STATE.WAIT;
    axios.get(SERVICE + '/api/move/confirmed/' + uid, {
        headers: { Authorization: `Bearer ${TOKEN}` }
    })
    .then(function (response) {
        console.log(response.data);
        app.state = STATE.MOVE;
    })
    .catch(function (error) {
        console.log('GETM ERROR: ' + error);
        logger.error('GETM ERROR: ' + error);
        app.state  = STATE.INIT;
    });
    return true;
}

let checkTurn = function(app) {
//  console.log('TURN');
    app.state = STATE.WAIT;
    axios.get(SERVICE + '/api/session/current', {
        headers: { Authorization: `Bearer ${TOKEN}` }
    })
    .then(function (response) {
        if (response.data.length > 0) {
            console.log(response.data);
            sid = response.data[0].id;
            setup = response.data[0].last_setup;
            app.state = STATE.RECO;
        } else {
            app.state = STATE.CHCK;
        }
      })
      .catch(function (error) {
        console.log('TURN ERROR: ' + error);
        logger.error('TURN ERROR: ' + error);
        app.state  = STATE.INIT;
      });
      return true;
}

function getSetup(fen) {
    let r = '?turn=';
    if (turn == 0) {
        r += '1;&setup=' + fen;
    } else {
        r += '0;&setup=' + fen;
    }
    return r;
}

let decodeFen = function(fen) {
    let board = [];
    let w = null;
    for (let i = 0; i < fen.length; i++) {
        let c = fen[i];
        if (c == ' ') break;
        if ((c >= '0') && (c <= 9)) {
            for (let k = 0; k < c; k++) {
                board.push('-');
            }
        } else if (c == '/') {
            if (w === null) {
                w = board.length;
            }
        } else {
            board.push(c);
        }
    }
    return {
        board: board,
        width: w
    };
}

let encodeFen = function(board, w) {
    let res = ''; let c = 0;
    for (let i = 0; i < board.length; i++) {
        if ((i > 0) && (i % w == 0)) {
            if (c > 0) {
                res += c;
                c = 0;
            }
            res += '/';
        }
        if (board[i] == '-') {
            c++;
        } else {
            if (c > 0) {
                res += c;
                c = 0;
            }
            res += board[i];
        }
    }
    if (c > 0) {
        res += c;
    }
    if (turn == 0) {
        res += ' b';
    } else {
        res += ' w';
    }
    return res;
}

function FinishTurnCallback(bestMove, fen, value, time, ply) {
    if (bestMove != null) {
        ai.MakeMove(bestMove);
        let move = ai.FormatMove(bestMove);
        const result = setup.match(/[?&]turn=(\d+)/);
        if (result) {
            turn = result[1];
        }
        console.log('move = ' + move + ', time=' + time + ', value=' + value + ', ply=' + ply);
        logger.info('move = ' + move + ', time=' + time + ', value=' + value + ', ply=' + ply);
/*      app.state  = STATE.WAIT;
        axios.post(SERVICE + '/api/move', {
            uid: uid,
            next_player: (turn == 0) ? 2 : 1,
            move_str: move,
            setup_str: getSetup(fen),
            note: 'time=' + time + ', value=' + value + ', ply=' + ply
        }, {
            headers: { Authorization: `Bearer ${TOKEN}` }
        })
        .then(function (response) {
            app.state  = STATE.TURN;
        })
        .catch(function (error) {
            console.log('MOVE ERROR: ' + error);
            logger.error('MOVE ERROR: ' + error);
            app.state  = STATE.INIT;
        });*/

        console.log('fen = ' + fen);
        app.state = STATE.STOP;
    }
    app.state  = STATE.STOP;
}

let checkPrefix = function(fen) {
    for (let i = 0; i < openings.length; i++) {
        if (fen.startsWith(openings[i].setup_prefix)) return openings[i].move_list;
    }
    return null;
}

let getFen = function(fen, move) {
    const d = decodeFen(fen);
    let board = d.board;
    const w = d.width;
    const moves = move.split('/');
    if (w === null) return null;
    const h = (board.length / w) | 0;
    const r = moves[0].match(/(\w)(\d) - (\w)(\d)/);
    if (!r) return null;
    const f = (h - r[2]) * w + (r[1].charCodeAt(0) - 'a'.charCodeAt(0));
    const t = (h - r[4]) * w + (r[3].charCodeAt(0) - 'a'.charCodeAt(0));
    if ((f >= board.length) || (t >= board.length)) return null;
    board[t] = board[f];
    board[f] = '-';
    return encodeFen(board, d.width);
}

let sendMove = function(app) {
    console.log('MOVE');
    app.state  = STATE.WAIT;
    const result = setup.match(/[?&]setup=(.*)/);
    if (result) {
        let fen = result[1];
        console.log('[' + sid + '] fen = ' + fen);
        logger.info('[' + sid + '] fen = ' + fen);
        let moves = checkPrefix(fen);
        if (moves) {
            const m = moves.split(',');
            console.log(m);
            logger.info(m);
            let ix = 0;
            if (m.length > 1) {
                ix = _.random(0, m.length - 1);
            }
            const move = m[ix];
            console.log('move = ' + move);
            logger.info('move = ' + move);
            const f = getFen(fen, move);
            console.log('fen = ' + f);
            if (f === null) {
                app.state  = STATE.STOP;
            } else {
                const r = setup.match(/[?&]turn=(\d+)/);
                if (r) {
                    turn = r[1];
                }
                let s = getSetup(f);
                console.log('s = ' + s);
                app.state  = STATE.WAIT;
                axios.post(SERVICE + '/api/move', {
                    uid: uid,
                    next_player: (turn == 0) ? 2 : 1,
                    move_str: move,
                    setup_str: s
                }, {
                    headers: { Authorization: `Bearer ${TOKEN}` }
                })
                .then(function (response) {
                    app.state  = STATE.TURN;
                })
                .catch(function (error) {
                    console.log('MOVE ERROR: ' + error);
                    logger.error('MOVE ERROR: ' + error);
                    app.state  = STATE.INIT;
                });
            }
        } else {
            ai.FindMove(fen, _.random(MIN_AI_TIMEOUT + (timeout ? timeout : 0), MAX_AI_TIMEOUT + (timeout ? timeout : 0)), FinishTurnCallback);
        }
    } else {
        app.state  = STATE.STOP;
    }
    return true;
}

let checkSess = function(app) {
//  console.log('CHCK');
    app.state = STATE.WAIT;
    axios.get(SERVICE + '/api/session/my', {
        headers: { Authorization: `Bearer ${TOKEN}` }
    })
    .then(function (response) {
        let data = _.filter(response.data, (it) => {
            return (it.status == 1) || (it.status == 2);
        });
        if (data.length >= MAX_SESSIONS) {
            app.state = STATE.TURN;
            return;
        }
        data = _.filter(response.data, (it) => {
            return (it.status == 1);
        });
        if (data.length >= MIN_SESSIONS) {
            app.state = STATE.TURN;
        } else {
            app.state = STATE.SESS;
        }
      })
      .catch(function (error) {
        console.log('CHCK ERROR: ' + error);
        logger.error('CHCK ERROR: ' + error);
        app.state  = STATE.INIT;
      });
    return true;
}

let addSess = function(app) {
    console.log('SESS');
    app.state = STATE.WAIT;
    axios.post(SERVICE + '/api/session', {
        game_id: 23,
        variant_id: 7,
        player_num: 2,
        filename: "xiangqi",
        ai: 0
    }, {
        headers: { Authorization: `Bearer ${TOKEN}` }
    })
    .then(function (response) {
        console.log(response.data);
        logger.info(response.data);
        app.state = STATE.TURN;
      })
      .catch(function (error) {
        console.log('SESS ERROR: ' + error);
        logger.error('SESS ERROR: ' + error);
        app.state  = STATE.INIT;
      });
    return true;
}

let wait = function(app) {
//  console.log('WAIT');
    return true;
}

let stop = function(app) {
    console.log('STOP');
    logger.info('STOP');
    return false;
}

App.prototype.exec = function() {
    if (_.isUndefined(this.states[this.state])) return true;
    return this.states[this.state](this);
}

app.states[STATE.INIT] = init;
app.states[STATE.WAIT] = wait;
app.states[STATE.STOP] = stop;
app.states[STATE.TURN] = checkTurn;
app.states[STATE.MOVE] = sendMove;
app.states[STATE.CHCK] = checkSess;
app.states[STATE.SESS] = addSess;
app.states[STATE.RECO] = recovery;
app.states[STATE.GETM] = getConfirmed;
app.states[STATE.STRT] = loadDebuts;

let run = function() {
    if (app.exec()) {
        setTimeout(run, 1000);
    }
}
run();
