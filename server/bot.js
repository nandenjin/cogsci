
const reversi = require( 'reversi' );

const realm = require( 'realm' );

const stateSchema = {
  name: 'State',
  primaryKey: 'id',
  properties: {
    id: 'string',
    oprs: 'Operation[]',
  }
};

const operationSchema = {
  name: 'Operation',
  properties: {
    id: 'int',
    count: 'int',
  }
};

const UID = 'bot';

const io = require( 'socket.io-client' );

const socket = io( 'http://localhost:3000' );


const rooms = {};

const ua = require('universal-analytics')( 'UA-61077297-1' );

socket.on( 'connect', () => {

  console.log( 'Connected.' );
  socket.emit( 'registerBot' );
  socket.emit( 'registerPipe' );

  socket.emit( 'openById', 'bot' );

} );

socket.on( 'connect_error', e => {

  console.error( e );

} );

setInterval( () => {

  for( let id in rooms ) {

    const room = rooms[ id ];

    if( room.owner && room.owner.uid === UID ) {

      if( room.isChallengerActive )
        room.challengerLastActive = Date.now();

      if( Date.now() - room.challengerLastActive > 60 * 1000 )
        socket.emit( 'resetGame', id );

    }

  }

}, 10 * 1000 );


socket.on( 'roomInfo', ( info, id ) => {

  rooms[ id ] = rooms[ id ] || {};

  for( let key in info ) rooms[ id ][ key ] = info[ key ];

  const room = rooms[ id ];

} );

socket.on( 'challengerJoined', id => {

  const room = rooms[ id ] || {};

  if( room.owner && room.owner.uid === UID ) {

    setTimeout( () => socket.emit( 'setStatus', id, 'ONGOING' ), 1500 );

  }

} );

socket.on( 'put', ( cursor, role, arr ) => {


  arr = arr.map( a => role === 1 ? a : revertPiece( a ) );

  const { token, n } = tokenize66( arr );

  cursor = { x: cursor.x - 2.5, y: cursor.y - 2.5 };
  cursor = rotate90Vec2( cursor, n );
  cursor = { x: cursor.x + 2.5, y: cursor.y + 2.5 };

  console.log( cursor, token );

  const oprId = cursor.x + cursor.y * 6;

  openDB().then( db => {

    db.write( () => {

      const o = db.objectForPrimaryKey( 'State', token ) || db.create( 'State', { id: token, oprs: [] } );
      const opr = o.oprs.find( p => p.id === oprId );

      if( opr ) opr.count++;
      else o.oprs.push( { id: oprId, count: 1 } );

    } );

  } ).catch( e => console.error( e ) );

  ua.event( 'Bot', 'learn' ).send();

} );

socket.on( 'requested', id => {

  console.log( 'Receive invitation.' );
  socket.emit( 'challenge', id );

  rooms[ id ] = {
    role: null,
    board: new reversi.Board( 6, 6 ),
  };

  ua.event( 'Bot', 'invited' ).send();

} );

socket.on( 'roleSet', ( role, id ) => {

  rooms[ id ] = rooms[ id ] || {};
  rooms[ id ].role = role;

} );

socket.on( 'boardData', ( arr, id ) => {

  rooms[ id ] = rooms[ id ] || {};
  
  if( rooms[ id ].board ) rooms[ id ].board.loadArray( arr );

} );

socket.on( 'commitRequested', ( id, boardData ) => {

  rooms[ id ] = rooms[ id ] || {};
  const room = rooms[ id ];

  openDB().then( db => {

    const bd = boardData.map( a => room.role === 1 ? a : revertPiece( a ) );

    const { token, n } = tokenize66( bd );

    console.log( 'Commit requested... board token = ' + token );

    const o = db.objectForPrimaryKey( 'State', token );
    let cursor;

    if( o ) {

      ua.event( 'Bot', 'hit', token ).send();

      console.log( '* ' + o.oprs.length + ' hits for token = ' + token );

      const oprs = o.oprs.map( o => o );
      oprs.sort( ( a, b ) => b.count - a.count );

      console.log( oprs );
      console.log( 'Picked up id = ' + oprs[0].id + ' ( ' + oprs[0].count + ' times appeared )' );

      const x = oprs[0].id % 6 - 2.5;
      const y = Math.floor( oprs[0].id / 6 ) - 2.5;

      cursor = rotate90Vec2( { x, y  }, -n );
      cursor.x += 2.5;
      cursor.y += 2.5;

    }else {

      ua.event( 'Bot', 'notHit', token ).send();

      console.log( 'No hit for token = ' + token );

      room.board = room.board || new reversi.Board( 6, 6 );
      room.board.loadArray( boardData );
      let suggestions = room.board.getSuggestions( room.role )
      .map( c => { return { cursor: c, affectLength: room.board.simulateEffect( c, room.role ).length } } );

      suggestions.sort( ( a, b ) => b.affectLength - a.affectLength );


      if( suggestions.length === 0 ) {

        console.error( 'No suggestions to commit. Abort' );
        return;

      }

      cursor = suggestions[ 0 ].cursor;

    }

    console.log( 'Sending commit( ' + cursor.x + ', ' + cursor.y + ' )' );
    setTimeout( () => socket.emit( 'commit', id, room.role, cursor ), 1000 + Math.random() * 2000 );

    ua.event( 'Bot', 'commit' ).send();

  } )


} );

socket.on( 'gameSet', ( id, data ) => {

  rooms[ id ] = rooms[ id ] || {};

  if( rooms[ id ].owner.uid === UID ) {

    setTimeout( () => socket.emit( 'resetGame', id ), 5000 );

  }

  const myLength = data.filter( l => l === rooms[ id ].role ).length;
  const enLength = 36 - myLength - data.filter( l => l === 0 ).length;

  ua.event( 'Bot', myLength >= enLength ? 'win' : 'lose' );
  ua.event( 'Bot', 'score', '', myLength );

} );

socket.on( 'invalidOpr', id => {

  console.log( '! Server returned invalidOpr error. @' + id );

} );

function rotate90Array66( arr, n ) {

  const res = [];

  n = n || 1;

  arr.forEach( ( r, i ) => {

    const { x, y } = rotate90Vec2( { x: i % 6 - 2.5, y: Math.floor( i / 6 ) - 2.5 }, n );
    res[ ( y + 2.5 ) * 6 + x + 2.5 ] = r;

  } );

  return res;

}

function rotate90Vec2( vec, n ) {

  let x = vec.x;
  let y = vec.y;

  n = n || 1;

  for( let i = 0; i < Math.abs( n ); i++ ) {

    const tx = x, ty = y;
    x = n > 0 ? ty : -ty;
    y = n > 0 ? - tx : tx;

  }

  return { x, y };

}

function tokenize66( arr ) {

  const pf = [];

  for( let n = 0; n < 4; n++ ) {

    const token = tokenize( rotate90Array66( arr, n ) );

    pf.push( { token, n } );

  }

  pf.sort( ( a, b ) => a.token !== b.token ? ( a.token < b.token ? -1 : 1 ) : 0 );

  return pf[ 0 ];

}

function tokenize( arr ) {

  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-=+*@`/()[]!?&$#~:;";
  let token = "";

  for( let i = 0; i <= arr.length; i+=4 ) {

    const a = arr[ i + 0 ] || 0;
    const b = arr[ i + 1 ] || 0;
    const c = arr[ i + 2 ] || 0;
    const d = arr[ i + 3 ] || 0;

    token += chars.charAt( a * 27 + b * 9 + c * 3 + d * 1 );

  }

  return token;

}

function openDB() {

  return realm.open( { schema: [ stateSchema, operationSchema ], path: __dirname + '/data/data' } );

}

function revertPiece( a ) {

  if( a === reversi.Board.colors.WHITE ) return reversi.Board.colors.BLACK;
  else if( a === reversi.Board.colors.BLACK ) return reversi.Board.colors.WHITE;
  else return a;

}
