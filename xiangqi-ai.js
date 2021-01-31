"use strict";

const _ = require('underscore');

const WIDTH   = 9;
const HEIGHT  = 10;

const colorWhite   = 0x08;
const colorBlack   = 0;

const pieceEmpty    = 0x00;
const pieceSoldier  = 0x01;
const pieceHorse    = 0x02;
const pieceElephant = 0x03;
const pieceChariot  = 0x04;
const pieceCannon   = 0x05;
const pieceAdvisor  = 0x06;
const pieceGeneral  = 0x07;

var g_timeout = 100;
var g_board = new Array(WIDTH * HEIGHT);
var g_darkOption = false;

// side to move, 0 or 8, 0 = black, 8 = white
var g_toMove;
var g_baseEval;
var g_hashKeyLow, g_hashKeyHigh;
var g_inCheck;

var g_moveCount = 0;
var g_moveUndoStack = new Array();
var g_move50 = 0;
var g_repMoveStack = new Array();

const g_hashSize = 1 << 22;
const g_hashMask = g_hashSize - 1;
var g_hashTable;

var g_killers;
var historyTable = new Array(32);

var g_zobristLow;
var g_zobristHigh;
var g_zobristBlackLow;
var g_zobristBlackHigh;

var materialTable = [0, 800, 3200, 1600, 7200, 3600, 1600, 600000];

function GetFen() {
    var result = "";
    for (var row = 0; row < HEIGHT; row++) {
        if (row != 0) 
            result += '/';
        var empty = 0;
        for (var col = 0; col < WIDTH; col++) {
            var piece = g_board[row * WIDTH + col];
            if (piece == 0) {
                empty++;
            }
            else {
                if (empty != 0) 
                    result += empty;
                empty = 0;
                var pieceChar = [" ", "s", "h", "e", "r", "c", "a", "g"][(piece & 0x7)];
                result += ((piece & colorWhite) != 0) ? pieceChar.toUpperCase() : pieceChar;
            }
        }
        if (empty != 0) {
            result += empty;
        }
    }
    result += g_toMove == colorWhite ? " w" : " b";
    return result;
}

function FormatSquare(square) {
    var letters = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
    return letters[square % WIDTH] + (HEIGHT - ((square / WIDTH) | 0));
}

function FormatMove(move) {
    return FormatSquare(move & 0xFF) + ' - ' + FormatSquare((move >> 8) & 0xFF);
}

function GenerateMove(from, to) {
    return from | (to << 8);
}

var cnw = [
  0,  0,  0,  0,  0,  0,  0,  0,  0,
  0,-10,-10,-10,-10,-10,-10,-10,-10,
  0,-10,-10,-10,-10,-10,-10,-10,-10,
  0,-10,-10,-10,-10,-10,-10,-10,-10,
  0,-10,-10,-10,-10,-10,-10,-10,-10,
  0,-10,-10,-10,-10,-10,-10,-10,-10,
  0,-10,-10,-10,-10,-10,-10,-10,-10,
  0,-10,-10,-10,-10,-10,-10,-10,-10,
  0,-10,-10,-10,-10,-10,-10,-10,-10,
  0,-10,-10,-10,-10,-10,-10,-10,-10
];

var rnw = [
  0,  0,  0,  0,  0,  0,  0,  0,  0,
  0,  0,  0,  0,  0,  0,  0,  0,  0,
  0,  0,  0,  0,  0,  0,  0,  0,  0,
  0,  0,  0,  0,  0,  0,  0,  0,  0,
  0,  0,  0,  0,  0,  0,  0,  0,  0,
  0,  0,  0,  0,  0,  0,  0,  0,  0,
  0,  0,  0,-10,  0,  0,  0,-10,  0,
  0,  0,  0,  0,-10,  0,  0,  0,-10,
  0,-10,  0,  0,-10,-10,  0,  0,  0,
  0,  0,-10,  0,  0,-10,-10,  0,  0
];

var cne = [
  0,  0,  0,  0,  0,  0,  0,  0,  0,
 -8, -8, -8, -8, -8, -8, -8, -8,  0,
 -8, -8, -8, -8, -8, -8, -8, -8,  0,
 -8, -8, -8, -8, -8, -8, -8, -8,  0,
 -8, -8, -8, -8, -8, -8, -8, -8,  0,
 -8, -8, -8, -8, -8, -8, -8, -8,  0,
 -8, -8, -8, -8, -8, -8, -8, -8,  0,
 -8, -8, -8, -8, -8, -8, -8, -8,  0,
 -8, -8, -8, -8, -8, -8, -8, -8,  0,
 -8, -8, -8, -8, -8, -8, -8, -8,  0
];

var rne = [
  0,  0,  0,  0,  0,  0,  0,  0,  0,
  0,  0,  0,  0,  0,  0,  0,  0,  0,
  0,  0,  0,  0,  0,  0,  0,  0,  0,
  0,  0,  0,  0,  0,  0,  0,  0,  0,
  0,  0,  0,  0,  0,  0,  0,  0,  0,
  0,  0,  0,  0,  0,  0,  0,  0,  0,
  0, -8,  0,  0,  0, -8,  0,  0,  0,
 -8,  0,  0,  0, -8,  0,  0,  0,  0,
  0,  0,  0, -8, -8,  0,  0, -8,  0,
  0,  0, -8, -8,  0,  0, -8,  0,  0
];

var cse = [
 10, 10, 10, 10, 10, 10, 10, 10,  0,
 10, 10, 10, 10, 10, 10, 10, 10,  0,
 10, 10, 10, 10, 10, 10, 10, 10,  0,
 10, 10, 10, 10, 10, 10, 10, 10,  0,
 10, 10, 10, 10, 10, 10, 10, 10,  0,
 10, 10, 10, 10, 10, 10, 10, 10,  0,
 10, 10, 10, 10, 10, 10, 10, 10,  0,
 10, 10, 10, 10, 10, 10, 10, 10,  0,
 10, 10, 10, 10, 10, 10, 10, 10,  0,
  0,  0,  0,  0,  0,  0,  0,  0,  0
];

var rse = [
  0,  0,  0,  0,  0,  0,  0,  0,  0,
  0,  0,  0,  0,  0,  0,  0,  0,  0,
  0,  0,  0,  0,  0,  0,  0,  0,  0,
  0,  0,  0,  0,  0,  0,  0,  0,  0,
  0,  0,  0,  0,  0,  0,  0,  0,  0,
  0,  0, 10,  0,  0,  0, 10,  0,  0,
  0,  0,  0, 10,  0,  0,  0, 10,  0,
 10,  0,  0, 10, 10,  0,  0,  0,  0,
  0, 10,  0,  0, 10, 10,  0,  0,  0,
  0,  0,  0,  0,  0,  0,  0,  0,  0
];

var csw = [
  0,  8,  8,  8,  8,  8,  8,  8,  8,
  0,  8,  8,  8,  8,  8,  8,  8,  8,
  0,  8,  8,  8,  8,  8,  8,  8,  8,
  0,  8,  8,  8,  8,  8,  8,  8,  8,
  0,  8,  8,  8,  8,  8,  8,  8,  8,
  0,  8,  8,  8,  8,  8,  8,  8,  8,
  0,  8,  8,  8,  8,  8,  8,  8,  8,
  0,  8,  8,  8,  8,  8,  8,  8,  8,
  0,  8,  8,  8,  8,  8,  8,  8,  8,
  0,  0,  0,  0,  0,  0,  0,  0,  0
];

var rsw = [
  0,  0,  0,  0,  0,  0,  0,  0,  0,
  0,  0,  0,  0,  0,  0,  0,  0,  0,
  0,  0,  0,  0,  0,  0,  0,  0,  0,
  0,  0,  0,  0,  0,  0,  0,  0,  0,
  0,  0,  0,  0,  0,  0,  0,  0,  0,
  0,  0,  8,  0,  0,  0,  8,  0,  0,
  0,  8,  0,  0,  0,  8,  0,  0,  0,
  0,  0,  0,  0,  8,  8,  0,  0,  8,
  0,  0,  0,  8,  8,  0,  0,  8,  0,
  0,  0,  0,  0,  0,  0,  0,  0,  0
];

var cn = [
  0,  0,  0,  0,  0,  0,  0,  0,  0,
 -9, -9, -9, -9, -9, -9, -9, -9, -9,
 -9, -9, -9, -9, -9, -9, -9, -9, -9,
 -9, -9, -9, -9, -9, -9, -9, -9, -9,
 -9, -9, -9, -9, -9, -9, -9, -9, -9,
 -9, -9, -9, -9, -9, -9, -9, -9, -9,
 -9, -9, -9, -9, -9, -9, -9, -9, -9,
 -9, -9, -9, -9, -9, -9, -9, -9, -9,
 -9, -9, -9, -9, -9, -9, -9, -9, -9,
 -9, -9, -9, -9, -9, -9, -9, -9, -9
];

var rn = [
  0,  0,  0,  0,  0,  0,  0,  0,  0,
 -9, -9, -9, -9, -9, -9, -9, -9, -9,
 -9, -9, -9, -9, -9, -9, -9, -9, -9,
 -9, -9, -9, -9, -9, -9, -9, -9, -9,
 -9, -9, -9, -9, -9, -9, -9, -9, -9,
 -9,  0, -9,  0, -9,  0, -9,  0, -9,
 -9,  0, -9,  0, -9,  0, -9,  0, -9,
  0,  0,  0,  0,  0,  0,  0,  0,  0,
  0,  0,  0, -9, -9, -9,  0,  0,  0,
  0,  0,  0, -9, -9, -9,  0,  0,  0
];

var cs = [
  9,  9,  9,  9,  9,  9,  9,  9,  9,
  9,  9,  9,  9,  9,  9,  9,  9,  9,
  9,  9,  9,  9,  9,  9,  9,  9,  9,
  9,  9,  9,  9,  9,  9,  9,  9,  9,
  9,  9,  9,  9,  9,  9,  9,  9,  9,
  9,  9,  9,  9,  9,  9,  9,  9,  9,
  9,  9,  9,  9,  9,  9,  9,  9,  9,
  9,  9,  9,  9,  9,  9,  9,  9,  9,
  9,  9,  9,  9,  9,  9,  9,  9,  9,
  0,  0,  0,  0,  0,  0,  0,  0,  0
];

var rs = [
  0,  0,  0,  0,  0,  0,  0,  0,  0,
  0,  0,  0,  0,  0,  0,  0,  0,  0,
  0,  0,  0,  0,  0,  0,  0,  0,  0,
  0,  0,  0,  0,  0,  0,  0,  0,  0,
  0,  0,  0,  0,  0,  0,  0,  0,  0,
  0,  0,  0,  0,  0,  0,  0,  0,  0,
  0,  0,  0,  0,  0,  0,  0,  0,  0,
  0,  0,  0,  9,  9,  9,  0,  0,  0,
  0,  0,  0,  9,  9,  9,  0,  0,  0,
  0,  0,  0,  0,  0,  0,  0,  0,  0
];

var cw = [
  0, -1, -1, -1, -1, -1, -1, -1, -1,
  0, -1, -1, -1, -1, -1, -1, -1, -1,
  0, -1, -1, -1, -1, -1, -1, -1, -1,
  0, -1, -1, -1, -1, -1, -1, -1, -1,
  0, -1, -1, -1, -1, -1, -1, -1, -1,
  0, -1, -1, -1, -1, -1, -1, -1, -1,
  0, -1, -1, -1, -1, -1, -1, -1, -1,
  0, -1, -1, -1, -1, -1, -1, -1, -1,
  0, -1, -1, -1, -1, -1, -1, -1, -1,
  0, -1, -1, -1, -1, -1, -1, -1, -1
];

var rw = [
  0, -1, -1, -1, -1, -1, -1, -1, -1,
  0, -1, -1, -1, -1, -1, -1, -1, -1,
  0, -1, -1, -1, -1, -1, -1, -1, -1,
  0, -1, -1, -1, -1, -1, -1, -1, -1,
  0, -1, -1, -1, -1, -1, -1, -1, -1,
  0,  0,  0,  0,  0,  0,  0,  0,  0,
  0,  0,  0,  0,  0,  0,  0,  0,  0,
  0,  0,  0,  0, -1, -1,  0,  0,  0,
  0,  0,  0,  0, -1, -1,  0,  0,  0,
  0,  0,  0,  0, -1, -1,  0,  0,  0
];

var ce = [
  1,  1,  1,  1,  1,  1,  1,  1,  0,
  1,  1,  1,  1,  1,  1,  1,  1,  0,
  1,  1,  1,  1,  1,  1,  1,  1,  0,
  1,  1,  1,  1,  1,  1,  1,  1,  0,
  1,  1,  1,  1,  1,  1,  1,  1,  0,
  1,  1,  1,  1,  1,  1,  1,  1,  0,
  1,  1,  1,  1,  1,  1,  1,  1,  0,
  1,  1,  1,  1,  1,  1,  1,  1,  0,
  1,  1,  1,  1,  1,  1,  1,  1,  0,
  1,  1,  1,  1,  1,  1,  1,  1,  0
];

var re = [
  1,  1,  1,  1,  1,  1,  1,  1,  0,
  1,  1,  1,  1,  1,  1,  1,  1,  0,
  1,  1,  1,  1,  1,  1,  1,  1,  0,
  1,  1,  1,  1,  1,  1,  1,  1,  0,
  1,  1,  1,  1,  1,  1,  1,  1,  0,
  0,  0,  0,  0,  0,  0,  0,  0,  0,
  0,  0,  0,  0,  0,  0,  0,  0,  0,
  0,  0,  0,  1,  1,  0,  0,  0,  0,
  0,  0,  0,  1,  1,  0,  0,  0,  0,
  0,  0,  0,  1,  1,  0,  0,  0,  0
];

function flipTable(pos, color) {
  if (color != colorWhite) {
      return 89 - pos;
  } else {
      return pos;
  }
}

function navigate(pos, dir, color) {
  var p = flipTable(pos, color);
  var delta = dir[p];
  if (delta == 0) {
      return null;
  }
  p += delta;
  return flipTable(p, color);
}

function IsAttackableFromDirection(target, color, dir, sliders, opp) {
    var p = navigate(target, dir, color);
    if (p === null) return false;
    var piece = g_board[p];
    if ((piece != pieceEmpty) && ((piece & 8) != color)) {
        const pieceType = piece & 7;
        if (_.indexOf(sliders, pieceType) >= 0) return true;
        if ((pieceType == pieceSoldier) && opp) {
            if (navigate(p, opp, piece & 8) !== null) return true;
        }
        if (pieceType == pieceGeneral) return true;
    }
    while (piece == pieceEmpty) {
        p = navigate(p, dir, color);
        if (p === null) return false;
        piece = g_board[p];
    }
    const pieceType = piece & 7;
    if ((_.indexOf(sliders, pieceType) >= 0) && ((piece & 8) != color)) return true;
    p = navigate(p, dir, color);
    while (p !== null) {
        piece = g_board[p];
        if ((piece & 8) == color) return false;
        if ((piece & 7) == pieceCannon) return true;
        p = navigate(p, dir, color);
    }
    return false;
}

function IsAttackableByElephant(target, color, dir, opp) {
    var p = navigate(target, dir, color);
    if (p === null) return false;
    var piece = g_board[p];
    if (piece != pieceEmpty) {
        if ((piece & 8) == color) return false;
        if ((piece & 7) == pieceAdvisor) {
            return navigate(p, opp, piece & 8) !== null;
        }
        return false;
    }
    p = navigate(p, dir, color);
    if (p === null) return false;
    piece = g_board[p];
    if (piece == pieceEmpty) return false;
    if ((piece & 8) == color) return false;
    if ((piece & 7) != pieceElephant) return false;
    return navigate(p, opp, piece & 8) !== null;
}

function IsAttackableByKnight(target, color, d, o) {
    var p = navigate(target, d, colorWhite);
    if (p === null) return false;
    var piece = g_board[p];
    if (piece != pieceEmpty) return false;
    p = navigate(p, o, colorWhite);
    if (p === null) return false;
    piece = g_board[p];
    if (piece == pieceEmpty) return false;
    if ((piece & 8) == color) return false;
    return (piece & 7) == pieceHorse;
}

function IsKingAttackable(target) {
    const color = g_board[target] & colorWhite;
    if (IsAttackableFromDirection(target, color, cn, [pieceChariot, pieceGeneral], rn)) return true;
    if (IsAttackableFromDirection(target, color, cs, [pieceChariot])) return true;
    if (IsAttackableFromDirection(target, color, cw, [pieceChariot], rw)) return true;
    if (IsAttackableFromDirection(target, color, ce, [pieceChariot], re)) return true;
    if (IsAttackableByKnight(target, color, cnw, cn)) return true;
    if (IsAttackableByKnight(target, color, cnw, cw)) return true;
    if (IsAttackableByKnight(target, color, csw, cs)) return true;
    if (IsAttackableByKnight(target, color, csw, cw)) return true;
    if (IsAttackableByKnight(target, color, cne, cn)) return true;
    if (IsAttackableByKnight(target, color, cne, ce)) return true;
    if (IsAttackableByKnight(target, color, cse, cs)) return true;
    if (IsAttackableByKnight(target, color, cse, ce)) return true;
    if (g_darkOption) {
        if (IsAttackableByElephant(target, color, cnw, cnw)) return true;
        if (IsAttackableByElephant(target, color, cne, cne)) return true;
        if (IsAttackableByElephant(target, color, csw, csw)) return true;
        if (IsAttackableByElephant(target, color, cse, cse)) return true;
    }
    return false;
}

function IsSoldierAttackedFrom(from, color, dir, callback) {
    var p = navigate(from, dir, color);
    if (p === null) return false;
    var x = g_board[p];
    if (x != pieceEmpty) {
        if ((x & 8) == color) return false;
    }
    return callback(from, p, true);
}

function IsLeaperAttackedFrom(from, color, o, d, callback) {
    var p = navigate(from, o, color);
    if (p === null) return false;
    if (g_board[p] != pieceEmpty) return false;
    p = navigate(p, d, color);
    if (p === null) return false;
    var x = g_board[p];
    if (x != pieceEmpty) {
        if ((x & 8) == color) return false;
    }
    return callback(from, p, true);
}

function IsRiderAttackedFrom(from, color, dir, callback) {
    var p = navigate(from, dir, colorWhite);
    while (p !== null) {
        var x = g_board[p];
        if (x != pieceEmpty) {
            if ((x & 8) == color) return false;
        }
        if (callback(from, p, false)) return true;
        if (x != pieceEmpty) return false;
        p = navigate(p, dir, colorWhite);
    }
    return false;
}

function IsCannonAttackedFrom(from, color, dir, callback) {
    var p = navigate(from, dir, colorWhite);
    while (p !== null) {
        if (g_board[p] != pieceEmpty) break;
        if (callback(from, p, false)) return false;
        p = navigate(p, dir, colorWhite);
    }
    p = navigate(p, dir, colorWhite);
    while (p !== null) {
        var x = g_board[p];
        if (x != pieceEmpty) {
            if ((x & 8) == color) return false;
            if (callback(from, p, true)) return true;
            return false;
        }
        p = navigate(p, dir, colorWhite);
    }
    return false;
}

function IsSquareAttackableFrom(from, callback) {
    const piece = g_board[from];
    if (piece == pieceEmpty) return false;
    const color = piece & 8;
    const pieceType = piece & 7;
    if (pieceType == pieceSoldier) {
        if (IsSoldierAttackedFrom(from, color, g_darkOption ? cn : rn, callback)) return true;
        if (IsSoldierAttackedFrom(from, color, g_darkOption ? ce : re, callback)) return true;
        if (IsSoldierAttackedFrom(from, color, g_darkOption ? cw : rw, callback)) return true;
    }
    if (pieceType == pieceAdvisor) {
        if (IsSoldierAttackedFrom(from, color, g_darkOption ? cne : rne, callback)) return true;
        if (IsSoldierAttackedFrom(from, color, g_darkOption ? cnw : rnw, callback)) return true;
        if (IsSoldierAttackedFrom(from, color, g_darkOption ? cse : rse, callback)) return true;
        if (IsSoldierAttackedFrom(from, color, g_darkOption ? csw : rsw, callback)) return true;
    }
    if (pieceType == pieceHorse) {
        if (IsLeaperAttackedFrom(from, color, cn, cne, callback)) return true;
        if (IsLeaperAttackedFrom(from, color, cn, cnw, callback)) return true;
        if (IsLeaperAttackedFrom(from, color, cs, cse, callback)) return true;
        if (IsLeaperAttackedFrom(from, color, cs, csw, callback)) return true;
        if (IsLeaperAttackedFrom(from, color, cw, cnw, callback)) return true;
        if (IsLeaperAttackedFrom(from, color, cw, csw, callback)) return true;
        if (IsLeaperAttackedFrom(from, color, ce, cne, callback)) return true;
        if (IsLeaperAttackedFrom(from, color, ce, cse, callback)) return true;
    }
    if (pieceType == pieceElephant) {
        if (IsLeaperAttackedFrom(from, color, g_darkOption ? cnw : rnw, g_darkOption ? cnw : rnw, callback)) return true;
        if (IsLeaperAttackedFrom(from, color, g_darkOption ? cne : rne, g_darkOption ? cne : rne, callback)) return true;
        if (IsLeaperAttackedFrom(from, color, g_darkOption ? csw : rsw, g_darkOption ? csw : rsw, callback)) return true;
        if (IsLeaperAttackedFrom(from, color, g_darkOption ? cse : rse, g_darkOption ? cse : rse, callback)) return true;
    }
    if (pieceType == pieceChariot) {
        if (IsRiderAttackedFrom(from, color, cn, callback)) return true;
        if (IsRiderAttackedFrom(from, color, cs, callback)) return true;
        if (IsRiderAttackedFrom(from, color, ce, callback)) return true;
        if (IsRiderAttackedFrom(from, color, cw, callback)) return true;
    }
    if (pieceType == pieceCannon) {
        if (IsCannonAttackedFrom(from, color, cn, callback)) return true;
        if (IsCannonAttackedFrom(from, color, cs, callback)) return true;
        if (IsCannonAttackedFrom(from, color, ce, callback)) return true;
        if (IsCannonAttackedFrom(from, color, cw, callback)) return true;
    }
    if (pieceType == pieceGeneral) {
        if (IsSoldierAttackedFrom(from, color, rn, callback)) return true;
        if (IsSoldierAttackedFrom(from, color, rs, callback)) return true;
        if (IsSoldierAttackedFrom(from, color, re, callback)) return true;
        if (IsSoldierAttackedFrom(from, color, rw, callback)) return true;
    }
    return false;
}

function GenerateAllMoves(moveStack) {
    for (var pos = 0; pos < 90; pos++) {
        var piece = g_board[pos];
        if ((piece != pieceEmpty) && ((piece & 8) == g_toMove)) {
            IsSquareAttackableFrom(pos, (from, to, flag) => {
                moveStack.push(GenerateMove(from, to));
                return flag;
            });
        }
    }
}

function GenerateCaptureMoves(moveStack) {
    for (var pos = 0; pos < 90; pos++) {
        var piece = g_board[pos];
        if ((piece != pieceEmpty) && ((piece & 8) == g_toMove)) {
            IsSquareAttackableFrom(pos, (from, to, flag) => {
                if (g_board[to] != pieceEmpty) {
                    moveStack.push(GenerateMove(from, to));
                }
                return flag;
            });
        }
    }
}

var pieceSquareAdj = [
    [   0,   0,   0,   0,   0,   0,   0,   0,   0,    // pieceEmpty
        0,   0,   0,   0,   0,   0,   0,   0,   0,
        0,   0,   0,   0,   0,   0,   0,   0,   0,
        0,   0,   0,   0,   0,   0,   0,   0,   0,
        0,   0,   0,   0,   0,   0,   0,   0,   0,
        0,   0,   0,   0,   0,   0,   0,   0,   0,
        0,   0,   0,   0,   0,   0,   0,   0,   0,
        0,   0,   0,   0,   0,   0,   0,   0,   0,
        0,   0,   0,   0,   0,   0,   0,   0,   0,
        0,   0,   0,   0,   0,   0,   0,   0,   0 ],

    [   0,   0,  40,   0,   0,   0,  40,   0,   0,    // pieceSoldier
        0,  10,  50,  40,  40,  40,  50,  10,   0,
       10,  20,  30,  30,  30,  30,  30,  20,  10,
        5,  10,  10,  20,  20,  20,  10,  10,   5,
        5,   5,   5,  10,  10,  10,   5,   5,   5,
        0,   0,   0,   0,   0,   0,   0,   0,   0,
        5,   0,   5,   0,   5,   0,   5,   0,   5,
        0,   0,   0,   0,   0,   0,   0,   0,   0,
        0,   0,   0,   0,   0,   0,   0,   0,   0,
        0,   0,   0,   0,   0,   0,   0,   0,   0 ],

    [-200,-100, -50, -50, -50, -50, -50,-100,-200,    // pieceHorse
     -100, -25, -10,   0,   0,   0, -10, -25,-100,
      -50, -10,  10,  20,  20,  20,  10, -10, -50,
      -50,   0,  40,  50,  50,  50,  40,   0, -50,
      -50,   0,  15,  60,  60,  60,  15,   0, -50,
      -50,   0,  15,  60,  60,  60,  15,   0, -50,
      -50,   0,  10,  20,  20,  20,  10,   0, -50,
      -50, -10,   0,   0,   0,   0,   0, -10, -50,
     -100, -25, -10, -10, -10, -10, -10, -25,-100,
     -200, -50, -25, -25, -25, -25, -25, -50,-200 ],

    [   0,   0,   0,   0,   0,   0,   0,   0,   0,    // pieceElephant
        0,   0,   0,   0,   0,   0,   0,   0,   0,
        0,   0,   0,   0,   0,   0,   0,   0,   0,
        0,   0,   0,   0,   0,   0,   0,   0,   0,
        0,   0,   0,   0,   0,   0,   0,   0,   0,
        0,   0,  20,   0,   0,   0,  20,   0,   0,
        0,   0,   0,   0,   0,   0,   0,   0,   0,
       10,   0,   0,   0,  50,   0,   0,   0,  10,
        0,   0,   0,   0,   0,   0,   0,   0,   0,
        0,   0,  30,   0,   0,   0,  30,   0,   0 ],

    [ -10, -10, -60, -10, -10, -10, -60, -10, -10,    // pieceChariot
       40,  70,  60,  10,  10,  10,  60,  70,  40,
      -60,  20,  10,   0, -30,   0,  10,  20, -60,
      -60,   0,   0,  30,  30,  30,   0,   0,   0,
      -60,   0,   0,  30,  30,  30,   0,   0,   0,
      -60,   0,   0,  30,  30,  30,   0,   0,   0,
      -60,   0,   0,  30,  30,  30,   0,   0,   0,
      -60,   0,   0,  10,  10,  10,   0,   0,   0,
      -60,   0,   0,   0,   0,   0,   0,   0, -60,
      -60,   0,   0, -10, -10, -10,   0,   0, -60 ],

    [ -10, -10, -60, -10, -10, -10, -60, -10, -10,    // pieceCannon
       40,  70,  60,  10,  10,  10,  60,  70,  40,
      -60,  20,  10,   0, -30,   0,  10,  20, -60,
      -60,   5,   5,  30,  30,  30,   5,   5,   0,
      -60,   5,   5,  30,  30,  30,   5,   5,   0,
      -60,   5,   5,  30,  30,  30,   5,   5,   0,
      -60,   5,   5,  30,  30,  30,   5,   5,   0,
      -60,   0,   0,  10,  10,  10,   0,   0,   0,
      -60,   0,   0,   0,   0,   0,   0,   0, -60,
      -60,   0,   0, -10, -10, -10,   0,   0, -60 ],
 
    [   0,   0,   0,   0,   0,   0,   0,   0,   0,    // pieceAdvisor
        0,   0,   0,   0,   0,   0,   0,   0,   0,
        0,   0,   0,   0,   0,   0,   0,   0,   0,
        0,   0,   0,   0,   0,   0,   0,   0,   0,
        0,   0,   0,   0,   0,   0,   0,   0,   0,
        0,   0,   0,   0,   0,   0,   0,   0,   0,
        0,   0,   0,   0,   0,   0,   0,   0,   0,
        0,   0,   0,  10,   0,  10,   0,   0,   0,
        0,   0,   0,   0,  20,   0,   0,   0,   0,
        0,   0,   0,  10,   0,  10,   0,   0,   0 ],

    [   0,   0,   0,   0,   0,   0,   0,   0,   0,    // pieceGeneral
        0,   0,   0,   0,   0,   0,   0,   0,   0,
        0,   0,   0,   0,   0,   0,   0,   0,   0,
        0,   0,   0,   0,   0,   0,   0,   0,   0,
        0,   0,   0,   0,   0,   0,   0,   0,   0,
        0,   0,   0,   0,   0,   0,   0,   0,   0,
        0,   0,   0,   0,   0,   0,   0,   0,   0,
        0,   0,   0,  10,  10,  10,   0,   0,   0,
        0,   0,   0,   5, -10,   5,   0,   0,   0,
        0,   0,   0,  10,  20,  10,   0,   0,   0 ]
];

var g_mobUnit;

function InitializeEval() {
    g_mobUnit = new Array(2);
    for (var i = 0; i < 2; i++) {
        g_mobUnit[i] = new Array();
        var enemy = i == 0 ? 0x10 : 8;
        var friend = i == 0 ? 8 : 0x10;
        g_mobUnit[i][0] = 1;
        g_mobUnit[i][0x80] = 0;
        g_mobUnit[i][enemy  | pieceSoldier]  = 1;
        g_mobUnit[i][enemy  | pieceElephant] = 2;
        g_mobUnit[i][enemy  | pieceHorse]    = 2;
        g_mobUnit[i][enemy  | pieceChariot]  = 4;
        g_mobUnit[i][enemy  | pieceCannon]   = 4;
        g_mobUnit[i][enemy  | pieceAdvisor]  = 4;
        g_mobUnit[i][enemy  | pieceGeneral]  = 6;
        g_mobUnit[i][friend | pieceSoldier]  = 0;
        g_mobUnit[i][friend | pieceElephant] = 0;
        g_mobUnit[i][friend | pieceHorse]    = 0;
        g_mobUnit[i][friend | pieceChariot]  = 0;
        g_mobUnit[i][friend | pieceCannon]   = 0;
        g_mobUnit[i][friend | pieceAdvisor]  = 0;
        g_mobUnit[i][friend | pieceGeneral]  = 0;
    }
}

function Mobility(color) {
    var result = 0;
    var from, p, q, mob, pieceIdx;
    var mobUnit = color == 8 ? g_mobUnit[0] : g_mobUnit[1];

    // Horse mobility
    mob = -3;
    pieceIdx = (color | pieceHorse) << 4;
    from = g_pieceList[pieceIdx++];
    while (from != 0) {
        p = navigate(from, cn, colorWhite);
        if ((p !== null) && (g_board[p] == pieceEmpty)) {
            q = navigate(p, cnw, colorWhite);
            if (q !== null) mob += mobUnit[g_board[q]];
            q = navigate(p, cne, colorWhite);
            if (q !== null) mob += mobUnit[g_board[q]];
        }
        p = navigate(from, cs, colorWhite);
        if ((p !== null) && (g_board[p] == pieceEmpty)) {
            q = navigate(p, csw, colorWhite);
            if (q !== null) mob += mobUnit[g_board[q]];
            q = navigate(p, cse, colorWhite);
            if (q !== null) mob += mobUnit[g_board[q]];
        }
        p = navigate(from, cw, colorWhite);
        if ((p !== null) && (g_board[p] == pieceEmpty)) {
            q = navigate(p, csw, colorWhite);
            if (q !== null) mob += mobUnit[g_board[q]];
            q = navigate(p, cnw, colorWhite);
            if (q !== null) mob += mobUnit[g_board[q]];
        }
        p = navigate(from, ce, colorWhite);
        if ((p !== null) && (g_board[p] == pieceEmpty)) {
            q = navigate(p, cse, colorWhite);
            if (q !== null) mob += mobUnit[g_board[q]];
            q = navigate(p, cne, colorWhite);
            if (q !== null) mob += mobUnit[g_board[q]];
        }
        from = g_pieceList[pieceIdx++];
    }
    result += 65 * mob;

    // Elephant mobility
    mob = -2;
    pieceIdx = (color | pieceElephant) << 4;
    from = g_pieceList[pieceIdx++];
    while (from != 0) {
        p = navigate(from, g_darkOption ? cnw : rnw, color);
        if ((p !== null) && (g_board[p] == pieceEmpty)) {
            q = navigate(p, g_darkOption ? cnw : rnw, color);
            if (q !== null) mob += mobUnit[g_board[q]];
        }
        p = navigate(from, g_darkOption ? cne : rne, color);
        if ((p !== null) && (g_board[p] == pieceEmpty)) {
            q = navigate(p, g_darkOption ? cne : rne, color);
            if (q !== null) mob += mobUnit[g_board[q]];
        }
        p = navigate(from, g_darkOption ? csw : rsw, color);
        if ((p !== null) && (g_board[p] == pieceEmpty)) {
            q = navigate(p, g_darkOption ? csw : rsw, color);
            if (q !== null) mob += mobUnit[g_board[q]];
        }
        p = navigate(from, g_darkOption ? cse : rse, color);
        if ((p !== null) && (g_board[p] == pieceEmpty)) {
            q = navigate(p, g_darkOption ? cse : rse, color);
            if (q !== null) mob += mobUnit[g_board[q]];
        }
        from = g_pieceList[pieceIdx++];
    }
    result += 44 * mob;

    // Chariot mobility
    mob = -4;
    pieceIdx = (color | pieceChariot) << 4;
    from = g_pieceList[pieceIdx++];
    while (from != 0) {
        p = navigate(from, cn, colorWhite);
        while (p !== null) {
            if (g_board[p] != pieceEmpty) {
                if ((g_board[p] & colorWhite) != color) mob++;
                break;
            }
            mob++;
            p = navigate(p, cn, colorWhite);
        }
        p = navigate(from, cs, colorWhite);
        while (p !== null) {
            if (g_board[p] != pieceEmpty) {
                if ((g_board[p] & colorWhite) != color) mob++;
                break;
            }
            mob++;
            p = navigate(p, cs, colorWhite);
        }
        p = navigate(from, cw, colorWhite);
        while (p !== null) {
            if (g_board[p] != pieceEmpty) {
                if ((g_board[p] & colorWhite) != color) mob++;
                break;
            }
            mob++;
            p = navigate(p, cw, colorWhite);
        }
        p = navigate(from, ce, colorWhite);
        while (p !== null) {
            if (g_board[p] != pieceEmpty) {
                if ((g_board[p] & colorWhite) != color) mob++;
                break;
            }
            mob++;
            p = navigate(p, ce, colorWhite);
        }
        from = g_pieceList[pieceIdx++];
    }
    result += 25 * mob;

    // Cannon mobility
    mob = -4;
    pieceIdx = (color | pieceCannon) << 4;
    from = g_pieceList[pieceIdx++];
    while (from != 0) {
        p = navigate(from, cn, colorWhite);
        while (p !== null) {
            if (g_board[p] != pieceEmpty) break;
            mob++;
            p = navigate(p, cn, colorWhite);
        }
        p = navigate(p, cn, colorWhite);
        while (p !== null) {
            if (g_board[p] != pieceEmpty) {
                if ((g_board[p] & colorWhite) != color) mob++;
                break;
            }
            p = navigate(p, cn, colorWhite);
        }
        p = navigate(from, cs, colorWhite);
        while (p !== null) {
            if (g_board[p] != pieceEmpty) break;
            mob++;
            p = navigate(p, cs, colorWhite);
        }
        p = navigate(p, cs, colorWhite);
        while (p !== null) {
            if (g_board[p] != pieceEmpty) {
                if ((g_board[p] & colorWhite) != color) mob++;
                break;
            }
            p = navigate(p, cs, colorWhite);
        }
        p = navigate(from, cw, colorWhite);
        while (p !== null) {
            if (g_board[p] != pieceEmpty) break;
            mob++;
            p = navigate(p, cw, colorWhite);
        }
        p = navigate(p, cw, colorWhite);
        while (p !== null) {
            if (g_board[p] != pieceEmpty) {
                if ((g_board[p] & colorWhite) != color) mob++;
                break;
            }
            p = navigate(p, cw, colorWhite);
        }
        p = navigate(from, ce, colorWhite);
        while (p !== null) {
            if (g_board[p] != pieceEmpty) break;
            mob++;
            p = navigate(p, ce, colorWhite);
        }
        p = navigate(p, ce, colorWhite);
        while (p !== null) {
            if (g_board[p] != pieceEmpty) {
                if ((g_board[p] & colorWhite) != color) mob++;
                break;
            }
            p = navigate(p, ce, colorWhite);
        }
        from = g_pieceList[pieceIdx++];
    }
    result += 25 * mob;

    return result;
}

function Evaluate() {
    var curEval = g_baseEval;
    var evalAdjust = 0;
    // Black bishop pair
    if (g_pieceCount[pieceElephant] >= 2)
        evalAdjust -= 500;
    // White bishop pair
    if (g_pieceCount[pieceElephant | colorWhite] >= 2)
        evalAdjust += 500;
    var mobility = Mobility(8) - Mobility(0);
    if (g_toMove == 0) {
        // Black
        curEval -= mobility;
        curEval -= evalAdjust;
    }
    else {
        curEval += mobility;
        curEval += evalAdjust;
    }
    return curEval;
}

var g_pieceIndex = new Array(90);
var g_pieceList  = new Array(2 * 8 * 16);
var g_pieceCount = new Array(2 * 8);

function InitializePieceList() {
    for (var i = 0; i < 16; i++) {
        g_pieceCount[i] = 0;
        for (var j = 0; j < 16; j++) {
            // 0 is used as the terminator for piece lists
            g_pieceList[(i << 4) | j] = 0;
        }
    }
    for (var i = 0; i < 90; i++) {
        g_pieceIndex[i] = 0;
        var piece = g_board[i] & 0xF;
        if (piece != pieceEmpty) {
			g_pieceList[(piece << 4) | g_pieceCount[piece]] = i;
			g_pieceIndex[i] = g_pieceCount[piece];
			g_pieceCount[piece]++;
        }
    }
}

function UndoHistory(inCheck, baseEval, hashKeyLow, hashKeyHigh, move50, captured) {
    this.inCheck = inCheck;
    this.baseEval = baseEval;
    this.hashKeyLow = hashKeyLow;
    this.hashKeyHigh = hashKeyHigh;
    this.move50 = move50;
    this.captured = captured;
}

function UnmakeMove(move) {
    g_toMove = 8 - g_toMove;

    g_moveCount--;
    g_inCheck = g_moveUndoStack[g_moveCount].inCheck;
    g_baseEval = g_moveUndoStack[g_moveCount].baseEval;
    g_hashKeyLow = g_moveUndoStack[g_moveCount].hashKeyLow;
    g_hashKeyHigh = g_moveUndoStack[g_moveCount].hashKeyHigh;
    g_move50 = g_moveUndoStack[g_moveCount].move50;

    const captured = g_moveUndoStack[g_moveCount].captured;
    const to = (move >> 8) & 0xFF;
    const from = move & 0xFF;
    var piece = g_board[to];

    g_board[from] = g_board[to];
    g_board[to] = captured;

	// Move our piece in the piece list
    g_pieceIndex[from] = g_pieceIndex[to];
    g_pieceList[((piece & 0xF) << 4) | g_pieceIndex[from]] = from;

    if (captured) {
		// Restore our piece to the piece list
        var captureType = captured & 0xF;
        g_pieceIndex[to] = g_pieceCount[captureType];
        g_pieceList[(captureType << 4) | g_pieceCount[captureType]] = to;
        g_pieceCount[captureType]++;
    }
}

function MakeMove(move) {
	const otherColor = 8 - g_toMove; 
    const to = (move >> 8) & 0xFF;
    const from = move & 0xFF;
    const captured = g_board[to];
    const piece = g_board[from];

    g_moveUndoStack[g_moveCount] = new UndoHistory(g_inCheck, g_baseEval, g_hashKeyLow, g_hashKeyHigh, g_move50, captured);
    g_moveCount++;

    if (captured) {
        const capturedType = captured & 0xF;

        g_pieceCount[capturedType]--;
        var lastPieceSquare = g_pieceList[(capturedType << 4) | g_pieceCount[capturedType]];
        g_pieceIndex[lastPieceSquare] = g_pieceIndex[to];
        g_pieceList[(capturedType << 4) | g_pieceIndex[lastPieceSquare]] = lastPieceSquare;
        g_pieceList[(capturedType << 4) | g_pieceCount[capturedType]] = 0;

        g_baseEval += materialTable[captured & 0x7];
        g_baseEval += pieceSquareAdj[captured & 0x7][flipTable(to, otherColor)];
        g_hashKeyLow ^= g_zobristLow[to][capturedType];
        g_hashKeyHigh ^= g_zobristHigh[to][capturedType];
        g_move50 = 0;
    }

    g_hashKeyLow ^= g_zobristLow[from][piece & 0xF];
    g_hashKeyHigh ^= g_zobristHigh[from][piece & 0xF];
    g_hashKeyLow ^= g_zobristLow[to][piece & 0xF];
    g_hashKeyHigh ^= g_zobristHigh[to][piece & 0xF];
    g_hashKeyLow ^= g_zobristBlackLow;
    g_hashKeyHigh ^= g_zobristBlackHigh;

    g_baseEval -= pieceSquareAdj[piece & 0x7][flipTable(from, g_toMove)];

    // Move our piece in the piece list
    g_pieceIndex[to] = g_pieceIndex[from];
    g_pieceList[((piece & 0xF) << 4) | g_pieceIndex[to]] = to;

    g_board[to] = g_board[from];
    g_baseEval += pieceSquareAdj[piece & 0x7][flipTable(to, g_toMove)];
    g_board[from] = pieceEmpty;

    g_toMove = otherColor;
    g_baseEval = -g_baseEval;

    if (IsKingAttackable(g_pieceList[(pieceGeneral | (8 - g_toMove)) << 4])) {
        UnmakeMove(move);
        return false;
    }
    g_inCheck = IsKingAttackable(g_pieceList[(pieceGeneral | g_toMove) << 4]);
    
    g_repMoveStack[g_moveCount - 1] = g_hashKeyLow;
    g_move50++;

    return true;
}

var g_seeValues = [0, 1, 3, 2, 5, 4, 2, 900,
    0, 1, 3, 2, 5, 4, 2, 900];

function See(move) {
    const from = move & 0xFF;
    const to = (move >> 8) & 0xFF;

    const fromPiece = g_board[from];

    const fromValue = g_seeValues[fromPiece & 0xF];
    const toValue = g_seeValues[g_board[to] & 0xF];

    if (fromValue <= toValue) {
        return true;
    }

    const us = (fromPiece & colorWhite) ? colorWhite : 0;
    const them = 8 - us;

    // Pawn attacks
    // If any opponent pawns can capture back, this capture is probably not worthwhile (as we must be using knight or above).
    var p = navigate(to, cn, us);
    if ((p !== null) && ((g_board[p] & 0xF) == (pieceSoldier | them))) return false;
    if (flipTable(to, us) >= 45) {
        p = navigate(to, cw, colorWhite);
        if ((p !== null) && ((g_board[p] & 0xF) == (pieceSoldier | them))) return false;
        p = navigate(to, ce, colorWhite);
        if ((p !== null) && ((g_board[p] & 0xF) == (pieceSoldier | them))) return false;
    }

    var themAttacks = new Array();

    // Knight attacks 
    // If any opponent knights can capture back, and the deficit we have to make up is greater than the knights value, 
    // it's not worth it.  We can capture on this square again, and the opponent doesn't have to capture back. 
    var captureDeficit = fromValue - toValue;
    var pieceIdx = (them | pieceHorse) << 4;
    var attackerSq = g_pieceList[pieceIdx++];
    while (attackerSq != 0) {
        if (IsSquareAttackableFrom(attackerSq, (start, stop) => {
            return stop == to;
        })) {
            themAttacks.push(attackerSq);
        }
        attackerSq = g_pieceList[pieceIdx++];
    }
    if (themAttacks.length != 0 && captureDeficit > g_seeValues[pieceHorse]) {
        return false;
    }

    // Slider attacks
    g_board[from] = 0;
    for (var pieceType = pieceChariot; pieceType <= pieceCannon; pieceType++) {
        pieceIdx = (them | pieceType) << 4;
        attackerSq = g_pieceList[pieceIdx++];
        var hit = false;
        while (attackerSq != 0) {
            if (IsSquareAttackableFrom(attackerSq, (start, stop) => {
                return stop == to;
            })) {
                themAttacks.push(attackerSq);
                hit = true;
            }
            attackerSq = g_pieceList[pieceIdx++];
        }
        if (hit) {
            if (captureDeficit > g_seeValues[pieceType]) {
                g_board[from] = fromPiece;
                return false;
            }
        }
    }

    // Elephant attacks 
    pieceIdx = (them | pieceElephant) << 4;
    attackerSq = g_pieceList[pieceIdx++];
    while (attackerSq != 0) {
        if (IsSquareAttackableFrom(attackerSq, (start, stop) => {
            return stop == to;
        })) {
            themAttacks.push(attackerSq);
        }
        attackerSq = g_pieceList[pieceIdx++];
    }

    // Advisor attacks 
    pieceIdx = (them | pieceAdvisor) << 4;
    attackerSq = g_pieceList[pieceIdx++];
    while (attackerSq != 0) {
        if (IsSquareAttackableFrom(attackerSq, (start, stop) => {
            return stop == to;
        })) {
            themAttacks.push(attackerSq);
        }
        attackerSq = g_pieceList[pieceIdx++];
    }

    // Pawn defenses 
    // At this point, we are sure we are making a "losing" capture.  The opponent can not capture back with a 
    // pawn.  They cannot capture back with a minor/major and stand pat either.  So, if we can capture with 
    // a pawn, it's got to be a winning or equal capture. 
    var p = navigate(to, cs, us);
    if ((p !== null) && ((g_board[p] & 0xF) == (pieceSoldier | us))) return true;
    if (flipTable(to, us) < 45) {
        p = navigate(to, cw, colorWhite);
        if ((p !== null) && ((g_board[p] & 0xF) == (pieceSoldier | us))) return true;
        p = navigate(to, ce, colorWhite);
        if ((p !== null) && ((g_board[p] & 0xF) == (pieceSoldier | us))) return true;
    }

    // King attacks
    pieceIdx = (them | pieceGeneral) << 4;
    attackerSq = g_pieceList[pieceIdx++];
    while (attackerSq != 0) {
        if (IsSquareAttackableFrom(attackerSq, (start, stop) => {
            return stop == to;
        })) {
            themAttacks.push(attackerSq);
        }
        attackerSq = g_pieceList[pieceIdx++];
    }

    // Our attacks
    var usAttacks = new Array();
    for (var pieceType = pieceHorse; pieceType <= pieceGeneral; pieceType++) {
        pieceIdx = (us | pieceType) << 4;
        attackerSq = g_pieceList[pieceIdx++];
        while (attackerSq != 0) {
            if (IsSquareAttackableFrom(attackerSq, (start, stop) => {
                return stop == to;
            })) {
                usAttacks.push(attackerSq);
            }
            attackerSq = g_pieceList[pieceIdx++];
        }
    }

    g_board[from] = fromPiece;

    // We are currently winning the amount of material of the captured piece, time to see if the opponent 
    // can get it back somehow.  We assume the opponent can capture our current piece in this score, which 
    // simplifies the later code considerably. 
    var seeValue = toValue - fromValue;

    // DEBUG:
    return false;

    for (; ; ) {
        var capturingPieceValue = 1000;
        var capturingPieceIndex = -1;

        // Find the least valuable piece of the opponent that can attack the square
        for (var i = 0; i < themAttacks.length; i++) {
             if (themAttacks[i] != 0) {
                 var pieceValue = g_seeValues[g_board[themAttacks[i]] & 0x7];
                 if (pieceValue < capturingPieceValue) {
                     capturingPieceValue = pieceValue;
                     capturingPieceIndex = i;
                 }
            }
        }
        
        if (capturingPieceIndex == -1) {
            // Opponent can't capture back, we win
            return true;
        }
        
        // Now, if seeValue < 0, the opponent is winning.  If even after we take their piece, 
        // we can't bring it back to 0, then we have lost this battle. 
        seeValue += capturingPieceValue;
        if (seeValue < 0) {
            return false;
        }

        var capturingPieceSquare = themAttacks[capturingPieceIndex];
        themAttacks[capturingPieceIndex] = 0;

        // Add any x-ray attackers
//      SeeAddXrayAttack(to, capturingPieceSquare, us, usAttacks, themAttacks);

        // Our turn to capture
        capturingPieceValue = 1000;
        capturingPieceIndex = -1;

        // Find our least valuable piece that can attack the square
        for (var i = 0; i < usAttacks.length; i++) {
            if (usAttacks[i] != 0) {
                var pieceValue = g_seeValues[g_board[usAttacks[i]] & 0x7];
                if (pieceValue < capturingPieceValue) {
                    capturingPieceValue = pieceValue;
                    capturingPieceIndex = i;
                }
            }
        }

        if (capturingPieceIndex == -1) {
            // We can't capture back, we lose :( 
            return false;
        }

        // Assume our opponent can capture us back, and if we are still winning, we can stand-pat 
        // here, and assume we've won. 
        seeValue -= capturingPieceValue;
        if (seeValue >= 0) {
            return true;
        }

        capturingPieceSquare = usAttacks[capturingPieceIndex];
        usAttacks[capturingPieceIndex] = 0;

        // Add any x-ray attackers
//      SeeAddXrayAttack(to, capturingPieceSquare, us, usAttacks, themAttacks);
    }
}    

const minEval = -2000000;
const maxEval = +2000000;
const minMateBuffer = minEval + 2000;
const maxMateBuffer = maxEval - 2000;

const hashflagAlpha = 1;
const hashflagBeta = 2;
const hashflagExact = 3;

var g_startTime;
var g_nodeCount;
var g_qNodeCount;
var g_searchValid;

function Search(finishMoveCallback, maxPly, finishPlyCallback) {
    var alpha = minEval;
    var beta = maxEval;
    
    g_nodeCount = 0;
    g_qNodeCount = 0;
    g_searchValid = true;
    
    var bestMove = 0;
    var value;
    
    g_startTime = (new Date()).getTime();

    for (var i = 1; i <= maxPly && g_searchValid; i++) {
        var tmp = AlphaBeta(i, 0, alpha, beta);
        if (!g_searchValid) break;

        value = tmp;

        if (value > alpha && value < beta) {
            alpha = value - 500;
            beta = value + 500;

            if (alpha < minEval) alpha = minEval;
            if (beta > maxEval) beta = maxEval;
        } else if (alpha != minEval) {
            alpha = minEval;
            beta = maxEval;
            i--;
        }

        if (g_hashTable[g_hashKeyLow & g_hashMask] != null) {
            bestMove = g_hashTable[g_hashKeyLow & g_hashMask].bestMove;
        }

        if (finishPlyCallback != null) {
            finishPlyCallback(bestMove, value, (new Date()).getTime() - g_startTime, i);
        }
    }

    if (finishMoveCallback != null) {
        MakeMove(bestMove);
        var curFen = GetFen();
        UnmakeMove(bestMove);
        finishMoveCallback(bestMove, curFen, value, (new Date()).getTime() - g_startTime, i - 1);
    }
}

function ScoreMove(move){
    var moveTo = (move >> 8) & 0xFF;
    var captured = g_board[moveTo] & 0x7;
    var piece = g_board[move & 0xFF];
    var score;
    if (captured != 0) {
        var pieceType = piece & 0x7;
        score = (captured << 5) - pieceType;
    } else {
        score = historyTable[piece & 0xF][moveTo];
    }
    return score;
}

function QSearch(alpha, beta, ply) {
    g_qNodeCount++;
    var realEval = g_inCheck ? (minEval + 1) : Evaluate();
    
    if (realEval >= beta) 
        return realEval;

    if (realEval > alpha)
        alpha = realEval;

    var moves = new Array();
    var moveScores = new Array();
    var wasInCheck = g_inCheck;

    if (wasInCheck) {
        GenerateAllMoves(moves);
        for (var i = 0; i < moves.length; i++) {
            moveScores[i] = ScoreMove(moves[i]);
        }
    } else {
        GenerateCaptureMoves(moves);
        for (var i = 0; i < moves.length; i++) {
            var captured = g_board[(moves[i] >> 8) & 0xFF] & 0x7;
            var pieceType = g_board[moves[i] & 0xFF] & 0x7;
            moveScores[i] = (captured << 5) - pieceType;
        }
    }

    for (var i = 0; i < moves.length; i++) {
        var bestMove = i;
        for (var j = moves.length - 1; j > i; j--) {
            if (moveScores[j] > moveScores[bestMove]) {
                bestMove = j;
            }
        }
        {
            var tmpMove = moves[i];
            moves[i] = moves[bestMove];
            moves[bestMove] = tmpMove;
            
            var tmpScore = moveScores[i];
            moveScores[i] = moveScores[bestMove];
            moveScores[bestMove] = tmpScore;
        }

        if (!wasInCheck && !See(moves[i])) {
            continue;
        }

        if (!MakeMove(moves[i])) {
            continue;
        }
        var value = -QSearch(-beta, -alpha, ply - 1);
        UnmakeMove(moves[i]);
        
        if (value > realEval) {
            if (value >= beta) 
                return value;
            
            if (value > alpha)
                alpha = value;
            
            realEval = value;
        }
    }
    return realEval;
}

function HashEntry(lock, value, flags, hashDepth, bestMove) {
    this.lock = lock;
    this.value = value;
    this.flags = flags;
    this.hashDepth = hashDepth;
    this.bestMove = bestMove;
}

function StoreHash(value, flags, ply, move, depth) {
	if (value >= maxMateBuffer)
		value += depth;
	else if (value <= minMateBuffer)
		value -= depth;
	g_hashTable[g_hashKeyLow & g_hashMask] = new HashEntry(g_hashKeyHigh, value, flags, ply, move);
}

function IsHashMoveValid(hashMove) {
    var from = hashMove & 0xFF;
    var to = (hashMove >> 8) & 0xFF;
    var ourPiece = g_board[from];
    var pieceType = ourPiece & 0x7;
    if (pieceType < pieceSoldier) return false;
    // Can't move a piece we don't control
    if (g_toMove != (ourPiece & 0x8))
        return false;
    // Can't move to a square that has something of the same color
    if (g_board[to] != 0 && (g_toMove == (g_board[to] & 0x8)))
        return false;
    // This validates that this piece type can actually make the attack
    if (hashMove >> 16) return false;
    return IsSquareAttackableFrom(from, (start, stop) => {
        return stop == to;
    });
}

function IsRepDraw() {
    var stop = g_moveCount - 1 - g_move50;
    stop = stop < 0 ? 0 : stop;
    for (var i = g_moveCount - 5; i >= stop; i -= 2) {
        if (g_repMoveStack[i] == g_hashKeyLow)
            return true;
    }
    return false;
}

function MovePicker(hashMove, depth, killer1, killer2) {
    this.hashMove = hashMove;
    this.depth = depth;
    this.killer1 = killer1;
    this.killer2 = killer2;

    this.moves = new Array();
    this.losingCaptures = null;
    this.moveCount = 0;
    this.atMove = -1;
    this.moveScores = null;
    this.stage = 0;

    this.nextMove = function () {
        if (++this.atMove == this.moveCount) {
            this.stage++;
            if (this.stage == 1) {
                if (this.hashMove != null && IsHashMoveValid(hashMove)) {
                    this.moves[0] = hashMove;
                    this.moveCount = 1;
                }
                if (this.moveCount != 1) {
                    this.hashMove = null;
                    this.stage++;
                }
            }

            if (this.stage == 2) {
                GenerateCaptureMoves(this.moves);
                this.moveCount = this.moves.length;
                this.moveScores = new Array(this.moveCount);
                // Move ordering
                for (var i = this.atMove; i < this.moveCount; i++) {
                    var captured = g_board[(this.moves[i] >> 8) & 0xFF] & 0x7;
                    var pieceType = g_board[this.moves[i] & 0xFF] & 0x7;
                    this.moveScores[i] = (captured << 5) - pieceType;
                }
                // No moves, onto next stage
                if (this.atMove == this.moveCount) this.stage++;
            }

            if (this.stage == 3) {
                if (IsHashMoveValid(this.killer1) &&
                    this.killer1 != this.hashMove) {
                    this.moves[this.moves.length] = this.killer1;
                    this.moveCount = this.moves.length;
                } else {
                    this.killer1 = 0;
                    this.stage++;
                }
            }

            if (this.stage == 4) {
                if (IsHashMoveValid(this.killer2) &&
                    this.killer2 != this.hashMove) {
                    this.moves[this.moves.length] = this.killer2;
                    this.moveCount = this.moves.length;
                } else {
                    this.killer2 = 0;
                    this.stage++;
                }
            }

            if (this.stage == 5) {
                GenerateAllMoves(this.moves);
                this.moveCount = this.moves.length;
                // Move ordering
                for (var i = this.atMove; i < this.moveCount; i++) this.moveScores[i] = ScoreMove(this.moves[i]);
                // No moves, onto next stage
                if (this.atMove == this.moveCount) this.stage++;
            }

            if (this.stage == 6) {
                // Losing captures
                if (this.losingCaptures != null) {
                    for (var i = 0; i < this.losingCaptures.length; i++) {
                        this.moves[this.moves.length] = this.losingCaptures[i];
                    }
                    for (var i = this.atMove; i < this.moveCount; i++) this.moveScores[i] = ScoreMove(this.moves[i]);
                    this.moveCount = this.moves.length;
                }
                // No moves, onto next stage
                if (this.atMove == this.moveCount) this.stage++;
            }

            if (this.stage == 7)
                return 0;
        }

        var bestMove = this.atMove;
        for (var j = this.atMove + 1; j < this.moveCount; j++) {
            if (this.moveScores[j] > this.moveScores[bestMove]) {
                bestMove = j;
            }
        }

        if (bestMove != this.atMove) {
            var tmpMove = this.moves[this.atMove];
            this.moves[this.atMove] = this.moves[bestMove];
            this.moves[bestMove] = tmpMove;

            var tmpScore = this.moveScores[this.atMove];
            this.moveScores[this.atMove] = this.moveScores[bestMove];
            this.moveScores[bestMove] = tmpScore;
        }

        var candidateMove = this.moves[this.atMove];
        if ((this.stage > 1 && candidateMove == this.hashMove) ||
            (this.stage > 3 && candidateMove == this.killer1) ||
            (this.stage > 4 && candidateMove == this.killer2)) {
            return this.nextMove();
        }

        if (this.stage == 2 && !See(candidateMove)) {
            if (this.losingCaptures == null) {
                this.losingCaptures = new Array();
            }
            this.losingCaptures[this.losingCaptures.length] = candidateMove;
            return this.nextMove();
        }

        return this.moves[this.atMove];
    }
}

function AllCutNode(ply, depth, beta, allowNull) {
    if (ply <= 0) {
        return QSearch(beta - 1, beta, 0);
    }

    if ((g_nodeCount & 127) == 127) {
        if ((new Date()).getTime() - g_startTime > g_timeout) {
            // Time cutoff
            g_searchValid = false;
            return beta - 1;
        }
    }

    g_nodeCount++;

    if (IsRepDraw())
        return 0;

    // Mate distance pruning
    if (minEval + depth >= beta)
       return beta;

    if (maxEval - (depth + 1) < beta)
	return beta - 1;

    var hashMove = null;
    var hashNode = g_hashTable[g_hashKeyLow & g_hashMask];
    if (hashNode != null && hashNode.lock == g_hashKeyHigh) {
        hashMove = hashNode.bestMove;
        if (hashNode.hashDepth >= ply) {
            var hashValue = hashNode.value;

            // Fixup mate scores
            if (hashValue >= maxMateBuffer)
                hashValue -= depth;
            else if (hashValue <= minMateBuffer)
                hashValue += depth;

            if (hashNode.flags == hashflagExact)
                return hashValue;
            if (hashNode.flags == hashflagAlpha && hashValue < beta)
                return hashValue;
            if (hashNode.flags == hashflagBeta && hashValue >= beta)
                return hashValue;
        }
    }

    if (!g_inCheck &&
        allowNull &&
        beta > minMateBuffer && 
        beta < maxMateBuffer) {
        // Try some razoring
        if (hashMove == null &&
            ply < 4) {
            var razorMargin = 2500 + 200 * ply;
            if (g_baseEval < beta - razorMargin) {
                var razorBeta = beta - razorMargin;
                var v = QSearch(razorBeta - 1, razorBeta, 0);
                if (v < razorBeta)
                    return v;
            }
        }
        
        // Null move
        if (ply > 1 &&
            g_baseEval >= beta - (ply >= 4 ? 2500 : 0) &&
            // Disable null move if potential zugzwang (no big pieces)
            (g_pieceCount[pieceElephant | g_toMove] != 0 ||
             g_pieceCount[pieceHorse    | g_toMove] != 0 ||
             g_pieceCount[pieceChariot  | g_toMove] != 0 ||
             g_pieceCount[pieceCannon   | g_toMove] != 0)) {
            var r = 3 + (ply >= 5 ? 1 : ply / 4);
            if (g_baseEval - beta > 1500) r++;

	        g_toMove = 8 - g_toMove;
	        g_baseEval = -g_baseEval;
	        g_hashKeyLow ^= g_zobristBlackLow;
	        g_hashKeyHigh ^= g_zobristBlackHigh;
			
	        var value = -AllCutNode(ply - r, depth + 1, -(beta - 1), false);

	        g_hashKeyLow ^= g_zobristBlackLow;
	        g_hashKeyHigh ^= g_zobristBlackHigh;
	        g_toMove = 8 - g_toMove;
	        g_baseEval = -g_baseEval;

            if (value >= beta)
	            return beta;
        }
    }

    var moveMade = false;
    var realEval = minEval - 1;

    var movePicker = new MovePicker(hashMove, depth, g_killers[depth][0], g_killers[depth][1]);

    for (;;) {
        var currentMove = movePicker.nextMove();
        if (currentMove == 0) {
            break;
        }

        var plyToSearch = ply - 1;

        if (!MakeMove(currentMove)) {
            continue;
        }

        var value;
        var doFullSearch = true;

        if (g_inCheck) {
            // Check extensions
            plyToSearch++;
        } else {
            var reduced = plyToSearch - (movePicker.atMove > 14 ? 2 : 1);
            // Late move reductions
            if (movePicker.stage == 5 && movePicker.atMove > 5 && ply >= 3) {
                value = -AllCutNode(reduced, depth + 1, -(beta - 1), true);
                doFullSearch = (value >= beta);
            }
        }

        if (doFullSearch) {
            value = -AllCutNode(plyToSearch, depth + 1, -(beta  - 1), true);
        }

        moveMade = true;

        UnmakeMove(currentMove);

        if (!g_searchValid) {
            return beta - 1;
        }

        if (value > realEval) {
            if (value >= beta) {
				var histTo = (currentMove >> 8) & 0xFF;
				if (g_board[histTo] == 0) {
				    var histPiece = g_board[currentMove & 0xFF] & 0xF;
				    historyTable[histPiece][histTo] += ply * ply;
				    if (historyTable[histPiece][histTo] > 32767) {
				        historyTable[histPiece][histTo] >>= 1;
				    }

				    if (g_killers[depth][0] != currentMove) {
				        g_killers[depth][1] = g_killers[depth][0];
				        g_killers[depth][0] = currentMove;
				    }
				}

                StoreHash(value, hashflagBeta, ply, currentMove, depth);
                return value;
            }

            realEval = value;
            hashMove = currentMove;
        }
    }

    if (!moveMade) {
        return minEval + depth;
    }

    StoreHash(realEval, hashflagAlpha, ply, hashMove, depth);
    return realEval;
}

function AlphaBeta(ply, depth, alpha, beta) {
    if (ply <= 0) {
        return QSearch(alpha, beta, 0);
    }

    g_nodeCount++;

    if (depth > 0 && IsRepDraw())
        return 0;

    // Mate distance pruning
    var oldAlpha = alpha;
    alpha = alpha < minEval + depth ? alpha : minEval + depth;
    beta = beta > maxEval - (depth + 1) ? beta : maxEval - (depth + 1);
    if (alpha >= beta)
       return alpha;

    var hashMove = null;
    var hashFlag = hashflagAlpha;
    var hashNode = g_hashTable[g_hashKeyLow & g_hashMask];
    if (hashNode != null && hashNode.lock == g_hashKeyHigh) {
        hashMove = hashNode.bestMove;
    }
    
    var moveMade = false;
    var realEval = minEval;

    var movePicker = new MovePicker(hashMove, depth, g_killers[depth][0], g_killers[depth][1]);

    for (;;) {
        var currentMove = movePicker.nextMove();
        if (currentMove == 0) {
            break;
        }

        var plyToSearch = ply - 1;

        if (!MakeMove(currentMove)) {
            continue;
        }

        if (g_inCheck) {
            // Check extensions
            plyToSearch++;
        }

        var value;
        if (moveMade) {
            value = -AllCutNode(plyToSearch, depth + 1, -alpha, true);
            if (value > alpha) {
                value = -AlphaBeta(plyToSearch, depth + 1, -beta, -alpha);
            }
        } else {
            value = -AlphaBeta(plyToSearch, depth + 1, -beta, -alpha);
        }

        moveMade = true;

        UnmakeMove(currentMove);

        if (!g_searchValid) {
            return alpha;
        }

        if (value > realEval) {
            if (value >= beta) {
                var histTo = (currentMove >> 8) & 0xFF;
                if (g_board[histTo] == 0) {
                    var histPiece = g_board[currentMove & 0xFF] & 0xF;
                    historyTable[histPiece][histTo] += ply * ply;
                    if (historyTable[histPiece][histTo] > 32767) {
                        historyTable[histPiece][histTo] >>= 1;
                    }

                    if (g_killers[depth][0] != currentMove) {
                        g_killers[depth][1] = g_killers[depth][0];
                        g_killers[depth][0] = currentMove;
                    }
                }

                StoreHash(value, hashflagBeta, ply, currentMove, depth);
                return value;
            }

            if (value > oldAlpha) {
                hashFlag = hashflagExact;
                alpha = value;
            }

            realEval = value;
            hashMove = currentMove;
        }
    }

    if (!moveMade) {
        return minEval + depth;
    }

    StoreHash(realEval, hashFlag, ply, hashMove, depth);
    return realEval;
}

function MT() {
   var N = 624;
   var M = 397;
   var MAG01 = [0x0, 0x9908b0df];
   
   this.mt = new Array(N);
   this.mti = N + 1;

   this.setSeed = function()
   {
       var a = arguments;
       switch (a.length) {
       case 1:
           if (a[0].constructor === Number) {
               this.mt[0]= a[0];
               for (var i = 1; i < N; ++i) {
                   var s = this.mt[i - 1] ^ (this.mt[i - 1] >>> 30);
                   this.mt[i] = ((1812433253 * ((s & 0xffff0000) >>> 16))
                           << 16)
                       + 1812433253 * (s & 0x0000ffff)
                       + i;
               }
               this.mti = N;
               return;
           }

           this.setSeed(19650218);

           var l = a[0].length;
           var i = 1;
           var j = 0;

           for (var k = N > l ? N : l; k != 0; --k) {
               var s = this.mt[i - 1] ^ (this.mt[i - 1] >>> 30)
               this.mt[i] = (this.mt[i]
                       ^ (((1664525 * ((s & 0xffff0000) >>> 16)) << 16)
                           + 1664525 * (s & 0x0000ffff)))
                   + a[0][j]
                   + j;
               if (++i >= N) {
                   this.mt[0] = this.mt[N - 1];
                   i = 1;
               }
               if (++j >= l) {
                   j = 0;
               }
           }

           for (var k = N - 1; k != 0; --k) {
               var s = this.mt[i - 1] ^ (this.mt[i - 1] >>> 30);
               this.mt[i] = (this.mt[i]
                       ^ (((1566083941 * ((s & 0xffff0000) >>> 16)) << 16)
                           + 1566083941 * (s & 0x0000ffff)))
                   - i;
               if (++i >= N) {
                   this.mt[0] = this.mt[N-1];
                   i = 1;
               }
           }

           this.mt[0] = 0x80000000;
           return;
       default:
           var seeds = new Array();
           for (var i = 0; i < a.length; ++i) {
               seeds.push(a[i]);
           }
           this.setSeed(seeds);
           return;
       }
   }

   this.setSeed(0x1BADF00D);

   this.next = function (bits)
   {
       if (this.mti >= N) {
           var x = 0;

           for (var k = 0; k < N - M; ++k) {
               x = (this.mt[k] & 0x80000000) | (this.mt[k + 1] & 0x7fffffff);
               this.mt[k] = this.mt[k + M] ^ (x >>> 1) ^ MAG01[x & 0x1];
           }
           for (var k = N - M; k < N - 1; ++k) {
               x = (this.mt[k] & 0x80000000) | (this.mt[k + 1] & 0x7fffffff);
               this.mt[k] = this.mt[k + (M - N)] ^ (x >>> 1) ^ MAG01[x & 0x1];
           }
           x = (this.mt[N - 1] & 0x80000000) | (this.mt[0] & 0x7fffffff);
           this.mt[N - 1] = this.mt[M - 1] ^ (x >>> 1) ^ MAG01[x & 0x1];

           this.mti = 0;
       }

       var y = this.mt[this.mti++];
       y ^= y >>> 11;
       y ^= (y << 7) & 0x9d2c5680;
       y ^= (y << 15) & 0xefc60000;
       y ^= y >>> 18;
       return (y >>> (32 - bits)) & 0xFFFFFFFF;
   }
}

function ResetGame() {
   g_killers = new Array(128);
   for (var i = 0; i < 128; i++) {
       g_killers[i] = [0, 0];
   }

   g_hashTable = new Array(g_hashSize);

   for (var i = 0; i < 32; i++) {
       historyTable[i] = new Array(256);
       for (var j = 0; j < 256; j++)
           historyTable[i][j] = 0;
   }

   var mt = new MT(0x1badf00d);

   g_zobristLow = new Array(90);
   g_zobristHigh = new Array(90);
   for (var i = 0; i < 90; i++) {
       g_zobristLow[i] = new Array(16);
       g_zobristHigh[i] = new Array(16);
       for (var j = 0; j < 16; j++) {
           g_zobristLow[i][j] = mt.next(32);
           g_zobristHigh[i][j] = mt.next(32);
       }
   }
   g_zobristBlackLow = mt.next(32);
   g_zobristBlackHigh = mt.next(32);
   InitializeEval();
}

function SetHash() {
    var result = new Object();
    result.hashKeyLow = 0;
    result.hashKeyHigh = 0;
    for (var i = 0; i < 90; i++) {
        var piece = g_board[i];
        if (piece != pieceEmpty) {
            result.hashKeyLow ^= g_zobristLow[i][piece & 0xF]
            result.hashKeyHigh ^= g_zobristHigh[i][piece & 0xF]
        }
    }
    if (!g_toMove) {
        result.hashKeyLow ^= g_zobristBlackLow;
        result.hashKeyHigh ^= g_zobristBlackHigh;
    }
    return result;
}

function MakeSquare(row, col) {
    return row * WIDTH + col;
}

function InitializeFromFen(fen) {
    var chunks = fen.split(' ');

    var row = 0;
    var col = 0;

    for (var i = 0; i < 90; i++) 
        g_board[i] = pieceEmpty;

    var pieces = chunks[0];
    for (var i = 0; i < pieces.length; i++) {
        var c = pieces.charAt(i);

        if (c == '/') {
            row++;
            col = 0;
        }
        else {
            if (c >= '0' && c <= '9') {
                for (var j = 0; j < parseInt(c); j++) {
                    g_board[MakeSquare(row, col)] = 0;
                    col++;
                }
            }
            else {
                var isBlack = c >= 'a' && c <= 'z';
                var piece = isBlack ? colorBlack : colorWhite;
                if (!isBlack) 
                    c = pieces.toLowerCase().charAt(i);
                switch (c) {
                    case 's':
                        piece |= pieceSoldier;
                        break;
                    case 'h':
                        piece |= pieceHorse;
                        break;
                    case 'e':
                        piece |= pieceElephant;
                        break;
                    case 'r':
                        piece |= pieceChariot;
                        break;
                    case 'c':
                        piece |= pieceCannon;
                        break;
                    case 'a':
                        piece |= pieceAdvisor;
                        break;
                    case 'g':
                        piece |= pieceGeneral;
                        break;
                }

                g_board[MakeSquare(row, col)] = piece;
                col++;
            }
        }
    }

    InitializePieceList();

    g_toMove = chunks[1].charAt(0) == 'w' ? colorWhite : 0;

    var hashResult = SetHash();
    g_hashKeyLow = hashResult.hashKeyLow;
    g_hashKeyHigh = hashResult.hashKeyHigh;

    g_baseEval = 0;
    for (var p = 0; p < 90; p++) {
        if (g_board[p] != pieceEmpty) {
            if (g_board[p] & colorWhite) {
                g_baseEval += pieceSquareAdj[g_board[p] & 0x7][p];
                g_baseEval += materialTable[g_board[p] & 0x7];
            } else {
                g_baseEval -= pieceSquareAdj[g_board[p] & 0x7][flipTable(p, 0)];
                g_baseEval -= materialTable[g_board[p] & 0x7];
            }
        }
    }
    if (!g_toMove) g_baseEval = -g_baseEval;

    g_move50 = 0;
    g_inCheck = IsKingAttackable(g_pieceList[(g_toMove | pieceGeneral) << 4]);

    return '';
}

function debugPlyCallback(bestMove, value, time, ply) {
    console.log(FormatMove(bestMove) + ', v = ' + value + ', t = ' + time + ', ply = ' + ply);
}

function FindMove(fen, timeout, callback) {
    ResetGame();
    InitializeFromFen(fen);
    g_timeout = timeout;
    Search(callback, 99, debugPlyCallback);
}

module.exports.FindMove = FindMove;
module.exports.MakeMove = MakeMove;
module.exports.FormatMove = FormatMove;
