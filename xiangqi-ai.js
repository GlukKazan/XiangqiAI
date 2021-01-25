"use strict";

const WIDTH   = 9;
const HEIGHT  = 10;

const colorBlack   = 0x10;
const colorWhite   = 0x08;

const pieceEmpty   = 0x00;
const piecePawn    = 0x01;
const pieceKnight  = 0x02;
const pieceBishop  = 0x03;
const pieceRook    = 0x04;
const pieceCannon  = 0x05;
const pieceGeneral = 0x06;
const pieceKing    = 0x07;

const g_timeout = 100;
const g_board = new Array(WIDTH * HEIGHT);
var g_darkOption = false;
var g_toMove; // side to move, 0 or 8, 0 = black, 8 = white
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
var g_pieceCount = new Array(2 * 8);

var materialTable = [0, 800, 3200, 1600, 7200, 3600, 1600, 600000];

function GetFen() {
    var result = "";
    for (var row = 0; row < HEIGHT; row++) {
        if (row != 0) 
            result += '/';
        var empty = 0;
        for (var col = 0; col < WIDTH; col++) {
            var piece = g_board[((row + 2) << 4) + col + 4];
            if (piece == 0) {
                empty++;
            }
            else {
                if (empty != 0) 
                    result += empty;
                empty = 0;
                var pieceChar = [" ", "p", "n", "b", "r", "c", "g", "k"][(piece & 0x7)];
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

function flipTable(pos) {
  if (g_toMove != colorWhite) {
      return 89 - pos;
  } else {
      return pos;
  }
}

function navigate(pos, dirs) {
  const p = flipTable(pos);
  var delta = dirs[p];
  if (delta == 0) {
      return null;
  }
  pos += delta;
  return flipTable(pos);
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
    g_baseEval = -g_baseEval;

    g_moveCount--;
    g_inCheck = g_moveUndoStack[g_moveCount].inCheck;
    g_baseEval = g_moveUndoStack[g_moveCount].baseEval;
    g_hashKeyLow = g_moveUndoStack[g_moveCount].hashKeyLow;
    g_hashKeyHigh = g_moveUndoStack[g_moveCount].hashKeyHigh;
    g_move50 = g_moveUndoStack[g_moveCount].move50;

    const captured = g_moveUndoStack[g_moveCount].captured;
    const to = (move >> 8) & 0xFF;
    const from = move & 0xFF;

    g_board[from] = g_board[to];
    g_board[to] = captured;
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
        g_baseEval += materialTable[captured & 0x7];
//      g_baseEval += pieceSquareAdj[captured & 0x7][me ? flipTable[epcEnd] : epcEnd];
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

//  g_baseEval -= pieceSquareAdj[piece & 0x7][me == 0 ? flipTable[from] : from];

    g_board[to] = g_board[from];
//  g_baseEval += pieceSquareAdj[piece & 0x7][me == 0 ? flipTable[to] : to];
    g_board[from] = pieceEmpty;

    g_toMove = otherColor;
    g_baseEval = -g_baseEval;

    if ((piece & 0x7) == pieceKing || g_inCheck) {
//      if (IsSquareAttackable(g_pieceList[(pieceKing | (8 - g_toMove)) << 4], otherColor)) {
//          UnmakeMove(move);
//          return false;
//      }
    } else {
//      const kingPos = g_pieceList[(pieceKing | (8 - g_toMove)) << 4];
//      if (ExposesCheck(from, kingPos)) {
//          UnmakeMove(move);
//          return false;
//      }
    }

    g_inCheck = false;
/*  if (flags <= moveflagEPC) {
        var theirKingPos = g_pieceList[(pieceKing | g_toMove) << 4];
        // First check if the piece we moved can attack the enemy king
        g_inCheck = IsSquareAttackableFrom(theirKingPos, to);
        if (!g_inCheck) {
            // Now check if the square we moved from exposes check on the enemy king
            g_inCheck = ExposesCheck(from, theirKingPos);
            if (!g_inCheck) {
                // Finally, ep. capture can cause another square to be exposed
                if (epcEnd != to) {
                    g_inCheck = ExposesCheck(epcEnd, theirKingPos);
                }
            }
        }
    }
    else {
        // Castle or promotion, slow check
        g_inCheck = IsSquareAttackable(g_pieceList[(pieceKing | g_toMove) << 4], 8 - g_toMove);
    }*/

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

    // TODO: Pawn attacks
    // If any opponent pawns can capture back, this capture is probably not worthwhile (as we must be using knight or above).

    var themAttacks = new Array();

    // Knight attacks 
    // If any opponent knights can capture back, and the deficit we have to make up is greater than the knights value, 
    // it's not worth it.  We can capture on this square again, and the opponent doesn't have to capture back. 
    var captureDeficit = fromValue - toValue;
    SeeAddKnightAttacks(to, them, themAttacks);
    if (themAttacks.length != 0 && captureDeficit > g_seeValues[pieceKnight]) {
        return false;
    }

    // Rook attacks
    g_board[from] = 0;
    const pieceType = pieceRook;
    if (SeeAddSliderAttacks(to, them, themAttacks, pieceType)) {
        if (captureDeficit > g_seeValues[pieceType]) {
            g_board[from] = fromPiece;
            return false;
        }
    }

    // TODO: Cannon attacks

    // TODO: Pawn defenses 
    // At this point, we are sure we are making a "losing" capture.  The opponent can not capture back with a 
    // pawn.  They cannot capture back with a minor/major and stand pat either.  So, if we can capture with 
    // a pawn, it's got to be a winning or equal capture. 

    // King attacks
    SeeAddSliderAttacks(to, them, themAttacks, pieceKing);

    // Our attacks
    var usAttacks = new Array();
    SeeAddKnightAttacks(to, us, usAttacks);
    for (var pieceType = pieceBishop; pieceType <= pieceKing; pieceType++) {
        SeeAddSliderAttacks(to, us, usAttacks, pieceType);
    }

    g_board[from] = fromPiece;

    // We are currently winning the amount of material of the captured piece, time to see if the opponent 
    // can get it back somehow.  We assume the opponent can capture our current piece in this score, which 
    // simplifies the later code considerably. 
    var seeValue = toValue - fromValue;

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
        SeeAddXrayAttack(to, capturingPieceSquare, us, usAttacks, themAttacks);

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
        SeeAddXrayAttack(to, capturingPieceSquare, us, usAttacks, themAttacks);
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
        GenerateCaptureMoves(moves, null);
        GenerateAllMoves(moves);
        for (var i = 0; i < moves.length; i++) {
            moveScores[i] = ScoreMove(moves[i]);
        }
    } else {
        GenerateCaptureMoves(moves, null);
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
    if (pieceType < piecePawn) return false;
    // Can't move a piece we don't control
    if (g_toMove != (ourPiece & 0x8))
        return false;
    // Can't move to a square that has something of the same color
    if (g_board[to] != 0 && (g_toMove == (g_board[to] & 0x8)))
        return false;
    // This validates that this piece type can actually make the attack
    if (hashMove >> 16) return false;
    return IsSquareAttackableFrom(to, from);
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
                GenerateCaptureMoves(this.moves, null);
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
            (g_pieceCount[pieceBishop | g_toMove] != 0 ||
             g_pieceCount[pieceKnight | g_toMove] != 0 ||
             g_pieceCount[pieceRook   | g_toMove] != 0 ||
             g_pieceCount[pieceCannon | g_toMove] != 0)) {
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

   g_zobristLow = new Array(256);
   g_zobristHigh = new Array(256);
   for (var i = 0; i < 256; i++) {
       g_zobristLow[i] = new Array(16);
       g_zobristHigh[i] = new Array(16);
       for (var j = 0; j < 16; j++) {
           g_zobristLow[i][j] = mt.next(32);
           g_zobristHigh[i][j] = mt.next(32);
       }
   }
   g_zobristBlackLow = mt.next(32);
   g_zobristBlackHigh = mt.next(32);

   for (var row = 0; row < 8; row++) {
       for (var col = 0; col < 8; col++) {
           var square = MakeSquare(row, col);
           flipTable[square] = MakeSquare(7 - row, col);
       }
   }
}

function SetHash() {
    var result = new Object();
    result.hashKeyLow = 0;
    result.hashKeyHigh = 0;
    for (var i = 0; i < 256; i++) {
        var piece = g_board[i];
        if (piece & 0x18) {
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

function FindMove(fen, timeout, callback) {
    ResetGame();
    InitializeFromFen(fen);
    g_timeout = timeout;
    Search(callback, 99, null);
}

module.exports.FindMove = FindMove;
module.exports.MakeMove = MakeMove;
module.exports.FormatMove = FormatMove;