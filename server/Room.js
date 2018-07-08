
const reversi = require( 'reversi' );

const STATUSES = {

  WAITING_CHALLENGER: 1,
  ONGOING: 2,
  SUSPENDED: 3,

};

class Room{

  constructor( id ) {

    const b = reversi.Board.colors.BLACK;
    const w = reversi.Board.colors.WHITE;

    const checkerPattern = new reversi.Board( 2, 2 ).loadArray( [ w, b, b, w ] );

    const board = new reversi.Board( 6, 6 );
    board.copy( checkerPattern, new reversi.Cursor( 2, 2 ) );

    this.id = id;
    this.owner = null;
    this.challenger = null;
    this.listeners = [];
    this.board = board;

    this.committer = 0;
    this.status = STATUSES.WAITING_CHALLENGER;
    this.lastActive = Date.now();

  }

  reset() {

    const b = reversi.Board.colors.BLACK;
    const w = reversi.Board.colors.WHITE;

    this.setStatus( STATUSES.WAITING_CHALLENGER );
    this.setChallenger( null );
    this.committer = 0;

    const t = new reversi.Board( 6, 6 );
    const checkerPattern = new reversi.Board( 2, 2 ).loadArray( [ w, b, b, w ] );

    t.copy( checkerPattern, new reversi.Cursor( 2, 2 ) );
    this.board.copy( t );

    this.updateActiveLog();

  }

  getInfo() {

    return {
      id: this.id,
      owner: this.owner || null,
      challenger: this.challenger || null,
      listenersLength: this.listeners.length,
      status: this.status,
      committer: this.committer,

      isOwnerActive: this.isOwnerActive(),
      isChallengerActive: this.isChallengerActive(),
    };

  }

  broadcast( type, ...args ) {

    this.listeners.forEach( l => l.emit( type, ...args ) );

    return this;

  }

  broadcastInfo() {

    return this.broadcast( 'roomInfo', this.getInfo(), this.id );

  }

  broadcastBoardData() {
    
    return this.broadcast( 'boardData', this.board.toArray(), this.id );

  }

  addListener( socket ) {

    if( this.listeners.some( l => l === socket ) ) return this;

    this.listeners.push( socket );
    this.broadcastInfo();
    this.broadcastBoardData();
    this.sendStepSignal();

    return this;

  }

  setChallenger( socket ) {

    if( !socket ) {

      this.challenger = null;
      this.broadcastInfo();
      this.updateActiveLog();

      return;

    }

    if( this.challenger && this.challenger.uid !== socket.user.uid ) {

      socket.emit( 'alreadyInGame' );
      return false;

    }

    if( !socket.uid ) {

      socket.emit( 'authRequired' );
      return false;

    }

    this.challenger = socket.user;

    this.broadcast( 'challengerJoined' );

    this.addListener( socket );
    this.broadcastInfo();

    this.sendStepSignal();

    this.updateActiveLog();

    return this;

  }

  removeListener( socket ) {

    this.listeners = this.listeners.filter( l => l !== socket );
    this.broadcastInfo();

    return this;

  }

  commit( role, c ) {

    const cursor = new reversi.Cursor( c.x, c.y );
    const result = this.board.putPiece( cursor, role );

    if( !result ) return null;

    this.step();
    this.broadcast( 'commit', role, cursor );
    this.broadcastInfo();

    this.updateActiveLog();

    return result;

  }

  isOwnerActive() {

    return this.owner && this.listeners.some( l => l.user.uid === this.owner.uid );

  }

  isChallengerActive() {

    return this.challenger && this.listeners.some( l => l.user.uid === this.challenger.uid );

  }

  setStatus( status ) {

    this.status = status;
    this.broadcastInfo();

  }

  step() {

    this.committer = this.committer ? 0 : 1;

    const board = this.board;
    const isOwnerOK = board.getSuggestions( this.board.constructor.colors.BLACK ).length > 0;
    const isChallengerOK = board.getSuggestions( this.board.constructor.colors.WHITE ).length > 0;

    if( !isOwnerOK && !isChallengerOK ){

      this.broadcastBoardData();
      this.broadcast( 'gameSet', this.id, board.toArray() );
      this.setStatus( STATUSES.SUSPENDED );

      return;

    }else if ( this.committer === 0 && !isChallengerOK ) this.committer = 1;
    else if ( this.committer === 1 && !isOwnerOK ) this.committer = 0;

    this.sendStepSignal();

  }

  sendStepSignal() {

    const status = this.status;
    const committer =  this.committer;
    const colors = this.board.constructor.colors;

    this.listeners.forEach( listener => {

      const isOwner = this.owner && listener.user.uid === this.owner.uid;
      const isChallenger = this.challenger && listener.user.uid === this.challenger.uid;

      if( isOwner )      listener.emit( 'roleSet', colors.BLACK, this.id );
      if( isChallenger ) listener.emit( 'roleSet', colors.WHITE, this.id );

      if( this.status == STATUSES.ONGOING ) {

        if( isOwner )      listener.emit( committer ? 'commitRequested' : 'commitAccepted', this.id, this.board.toArray() );
        if( isChallenger ) listener.emit( committer ? 'commitAccepted' : 'commitRequested', this.id, this.board.toArray() );

      }

    } );

  }

  updateActiveLog() {

    this.lastActive = Date.now();

  }

  discard() {

    this.listeners.forEach( l => l.emit( 'roomClosed' ) );

    return this;

  }

  static get statuses() {

    return STATUSES;

  }

}

module.exports = Room;
