
import '../scss/index.scss';
import 'reversi/examples/css/HTMLRenderer.css';

import Vue from 'vue';
import * as reversi from 'reversi/build/reversi.module.js';

import firebase from 'firebase/app';
import 'firebase/auth';

import Push from 'push.js';

// サーバーホスト
const HOST = location.port == "8080" ? location.protocol + '//' + location.hostname + ':3000' : location.protocol + '//' + location.host;

let socket = null;


firebase.initializeApp( {

  apiKey: "AIzaSyAC-W0_3BEFJYn_BjFkYej8y7AdqFPDCrw",
  authDomain: "cogsci-reversi.firebaseapp.com",
  databaseURL: "https://cogsci-reversi.firebaseio.com",
  projectId: "cogsci-reversi",
  storageBucket: "cogsci-reversi.appspot.com",
  messagingSenderId: "720985692876",

} );


const b = reversi.Board.colors.BLACK;
const w = reversi.Board.colors.WHITE;

const board = new reversi.Board( 6, 6 );

const renderer = new reversi.HTMLRenderer( board );


board.on( 'change', () => {

  const es = board.toArray();

  app.blackLength = es.filter( e => e === b ).length;
  app.whiteLength = es.filter( e => e === w ).length;

} );

const app = new Vue( {

  el: '#app',

  data: {

    user: null,
    room: null,
    board: board,
    blackLength: 0,
    whiteLength: 0,
    url: location.href,

    connectionOK: false,
    notificationEnabled: false,

  },

  mounted() {

    this.$refs.board.appendChild( renderer.domElement );

    // 認証フック
    firebase.auth().onAuthStateChanged( user => {

      this.user = user;
      this.$emit( 'authStateChanged' );
      this.tryAuth();

    } );

    this.$on( 'authStateChanged', () => this.tryAuth() );

    this.$on( 'connectionReady', () => {

      if( location.search.match( /^\??([A-Za-z0-9]+)/ ) ) socket.emit( 'openById', RegExp.$1 );
      else if( this.user ) socket.emit( 'openById', this.user.uid );

    } );

    setInterval( () => this.notificationEnabled = Push.Permission.has(), 5000 );

    renderer.on( 'click', cursor => this.commit( renderer.role, cursor ) );

  },

  methods: {

    onSocketReady() {

      socket = io( HOST );

      socket.on( 'connect', () => {

        this.connectionOK = true;

      } );

      socket.on( 'reconnect', () => {

        this.tryAuth();

      } );

      socket.on( 'roomInfo', info => {
        console.log( 'Info received.' );
        this.room = info;
      } ); 

      socket.on( 'roleSet', role => {

        renderer.setRole( role );
        console.log( `Event: roleSet(${role})` );

      } );

      socket.on( 'commitRequested', () => {

        renderer.clickable = true;
        console.log( 'Event: commitRequested' );

      } );

      socket.on( 'commitAccepted', () => {

        renderer.clickable = false;
        console.log( 'Event: commitAccepted' );

      } );

      socket.on( 'commitReset', () => {

        renderer.clickable = false;
        console.log( 'Event: commitReset' );

      } );

      socket.on( 'commit', ( role, c ) => {

        console.log( `Commit received: ${ role } ( ${ c.x }, ${ c.y } )` );

        const cursor = new reversi.Cursor( c.x, c.y );

        board.putPiece( cursor, role );

      } );

      socket.on( 'boardData', array => {

        console.log( 'Board data sync.', array );

        board.loadArray( array );

      } );

      socket.on( 'notFound', () => {

        console.warn( 'Room not found.' );

        // リトライ
        setTimeout( () => this.$emit( 'connectionReady' ), 3000 );

      } );

      socket.on( 'challengerJoined', () => {

        if( Push.Permission.has() && typeof document.hidden !== "undefined" )
          Push.create( '挑戦者が現れました！', {

            body: 'ページを開いてゲームを始めましょう',
            icon: '/favicon.png',
            onClick() {

              window.focus();
              this.close();

            }

          } );

        console.info( 'Challenger joined.' );

      } );

      socket.on( 'disconnect', () => this.connectionOK = false )

    },

    signInWithTwitter() {

      const provider = new firebase.auth.TwitterAuthProvider();
      firebase.auth().signInWithPopup( provider );

    },

    tryAuth() {

      if( !socket ) return;

      if( !this.user ){

        socket.emit( 'authenticate', null );
        setTimeout( () => this.$emit( 'connectionReady' ), 500 );

      }else{

        this.user.getIdToken().then( idToken => {

          socket.emit( 'authenticate', idToken );
          setTimeout( () => this.$emit( 'connectionReady' ), 500 );

        })

      }

    },

    challenge() {

      socket.emit( 'challenge', this.room.id );

    },

    startGame() {

      socket.emit( 'setStatus', this.room.id, 'ONGOING' );

    },

    resetGame() {

      socket.emit( 'resetGame', this.room.id );

    },

    inviteBot() {

      socket.emit( 'inviteBot', this.room.id );

    },

    commit( role, cursor ) {

      socket.emit( 'commit', this.room.id, role, cursor );

    },

    signout() {

      firebase.auth().signOut();

    },

    requestNotification() {

      Push.Permission.request( () => this.notificationEnabled = true );

    },

  },

  watch: {

    room( room ) {

      history.replaceState( null, null, '/?' + room.id );
      this.url = location.href;

      // SUSPEND
      if( room.status === 3 ) {

        console.log( 'Room suspended.' );
        renderer.clickable = false;

      }

    },

  },

} );



{

  const script = document.createElement( 'script' );
  script.src = HOST + '/socket.io/socket.io.js';
  script.addEventListener( 'load', () => app.onSocketReady() );

  document.body.appendChild( script );

}
 
