
const express = require( 'express' );
const app = express();

const http = require( 'http' );
const server = http.Server( app );

app.use( '/', express.static( __dirname + '/../front/dist' ) );

const io = require( 'socket.io' )( server );

const reversi = require( 'reversi' );

const admin = require( 'firebase-admin' );
{
  const adminKey = require( './private/firebase-admin-key.json' );
  admin.initializeApp( {
    credential: admin.credential.cert( adminKey ),
  } );
}

const ua = require('universal-analytics')( 'UA-61077297-1' );

const Room = require( './Room.js' );
const rooms = {};

let pipes = [];

io.on( 'connection', socket => {

  socket.user = {};  

  // 認証
  socket.on( 'authenticate', token => {

    if( token ) {

      admin.auth().verifyIdToken( token ).then( decoded => {

        if( decoded ){
          socket.uid = decoded.uid;
          socket.user = { uid: decoded.uid };

          admin.auth().getUser( decoded.uid )
          .then( user => {
            socket.user.photoURL = user.photoURL;
            socket.user.displayName = user.displayName;
          } );

          console.log( 'User signed in: ' + socket.uid );
        }else console.log( 'Failed to decode token.' );

      } );

    }else {

      console.log( 'User signed out.' );

    }

  } );

  // ルーム読み込み
  socket.on( 'openById', id => {

    console.log( 'Attemoted to open room: ' + id );

    let room = rooms[ id ];

    if( !room ) {

      if( id && id == socket.uid ) {

        room = new Room( id );
        room.owner = socket.user;
        rooms[ id ] = room;

        console.log( 'Room created: ' + id );

      }else{
        socket.emit( 'notFound' );
        return;
      }

    }

    room.addListener( socket );

    ua.event( 'Game', 'listened' ).send();

  } );

  // 対戦開始
  socket.on( 'challenge', id => {

    if( !socket.uid ) {

      console.log( 'Challenge rejected: authRequired' );
      socket.emit( 'authRequired' );
      return;

    }

    let room = rooms[ id ];

    if( !room ) {

      console.log( 'Challenge rejected: notFound' );
      socket.emit( 'notFound' );
      return;

    }

    console.log( 'Challenge accepted: ' + socket.uid + '@' + id );
    room.setChallenger( socket );
    room.broadcastBoardData();

    ua.event( 'Game', 'challenge' ).send();

  } );

  // ステート入れ替え
  socket.on( 'setStatus', ( id, status ) => {

    let room = rooms[ id ];

    if( !room ) {

      console.log( 'setStatus rejected: notFound' );
      socket.emit( 'notFound' );
      return;

    }

    if( room.owner.uid !== socket.uid ) {

      console.log( 'setStatus rejected: permissionDenied' );
      socket.emit( 'permissionDenied' );
      return;

    }

    switch( status ) {

      case 'WAITING_CHALLENGER':
        room.setStatus( room.constructor.statuses.WAITING_CHALLENGER );
        break;
      case 'ONGOING':
        room.setStatus( room.constructor.statuses.ONGOING );
        break;
      case 'SUSPENDED':
        room.setStatus( room.constructor.statuses.SUSPENDED );
        break;

    }

    room.sendStepSignal();

  } );


  socket.on( 'commit', ( id, role, cursor ) => {

    let room = rooms[ id ];

    if( !room ) {

      console.log( 'Commit rejected: notFound' );
      socket.emit( 'notFound' );
      return;

    }else if ( room.owner && room.challenger && room.owner.uid !== socket.user.uid && room.challenger.uid != socket.user.uid ) {

      console.log( 'Commit rejected: permissionDenied' );
      socket.emit( 'permissionDenied' );
      return;

    }

    const before = room.board.toArray();

    const result = room.commit( role, cursor );

    if( result ) {

      if( !socket.user.isBot ) pipes.forEach( p => p.emit( 'put', cursor, role, before, ) );

      ua.event( 'Game', 'commit' ).send();

    }else {

      console.log( 'Commit rejected: invalidOpr' );
      socket.emit( 'invalidOpr' );
      room.broadcastBoardData();
    }

  } );

  socket.on( 'resetGame', id => {

    let room = rooms[ id ];

    if( !room ) {

      console.log( 'Reset rejected: notFound' );
      socket.emit( 'notFound' );
      return;

    }else if ( room.owner.uid !== socket.user.uid ) {

      console.log( 'Reset rejected: permissionDenied' );
      socket.emit( 'permissionDenied' );
      return;

    }
 
    room.reset();

  } );

  socket.on( 'inviteBot', id => {

    let room = rooms[ id ];

    if( !room ) {

      console.log( 'Reset rejected: notFound' );
      socket.emit( 'notFound' );
      return;

    }else if ( room.owner.uid !== socket.user.uid ) {

      console.log( 'Reset rejected: permissionDenied' );
      socket.emit( 'permissionDenied' );
      return;

    }
    
    console.log( 'Sending invitation to bot... : ' + id );

    pipes.filter( p => p.user.isBot ).forEach( s => s.emit( 'requested', id ) );

  } );


  socket.on( 'disconnect', () => {

    const uid = socket.user.uid;

    console.log( 'User disconnected: ' + uid );

    pipes = pipes.filter( p => p !== socket );

    if( !uid ) return;

    for( let key in rooms ) {

      if( rooms[ key ] ) rooms[ key ].removeListener( socket );

    }

  } );

  socket.on( 'registerBot', () => {

    console.log( 'A bot connected.' );
    socket.user.isBot = true;

  } );

  socket.on( 'registerPipe', () => {

    console.log( 'A pipe connected.' );
    if( !pipes.some( p => p === socket ) ) pipes.push( socket );
    socket.uid = 'pipe' + Math.floor( Math.random() * 100000000 );
    socket.user.uid = socket.uid;
    socket.user.displayName = 'ボット';
    socket.user.photoURL = '/favicon.png';

  } ); 


} );

server.listen( 3000, () => {

  console.log( "Listening :3000" );

} );






setInterval( () => {

  for( let id in rooms ) {

    if( rooms[ id ] ){

      const room = rooms[ id ];

      if(
        !room.isOwnerActive()
        && !room.isChallengerActive()
        && room.lastActive < Date.now() - 1000 * 60 * 60 ) {

        rooms[ id ].discard();
        console.log( `Room discarded: ${ id }` );

        delete rooms[ id ];

      }

    }

  }

}, 1000 * 60 );

