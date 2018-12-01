import React, { Component, button } from 'react';
import PrintProvider, { Print, NoPrint } from 'react-easy-print';
import './App.css';

var ELECTION = {
  id: "DEMO",
  title: "Demo Election",
  contests: [
    {
      id: "president",
      type: "plurality",
      name: "President",
      options: [
        "Minnie Mouse",
        "Mickey Mouse",
        "Donald Duck"
        ]
    },
    {
      id: "senator",
      type: "plurality",
      name: "Senator",
      options: [
        "Chad Hanging",
        "Lev Ermachine",
        "John Smith"
        ]
    }
  ]
};

class Ballot extends Component {
  constructor(props) {
    super(props);
    this.state = {election: props.election, ballot: props.ballot}
  }
  
  render() {
    let rows = []

    // Outer loop to create parent
    for (let contest of this.state.election.contests) {
      rows.push(<tr key={contest.id}><th align="left" width="30%">{contest.name}</th><td>{this.state.ballot?this.state.ballot[contest.id]:''}</td></tr>);
    }

    return (
      <table width="100%" style={{fontSize: "1.5em"}}>
        <tbody>
          <tr key="title"><th colSpan="2" style={{fontSize: "2em"}}>Official Ballot</th></tr>
          <tr key="space"><th>&nbsp;</th></tr>
          {rows}
        </tbody>
      </table>
    );      
  }
}

class App extends Component {
  print() {
    window.print();
  }
  
  render() {
    return (
      <PrintProvider>
	<Print single printOnly name="ballot">
          <Ballot election={ELECTION} ballot={{president: "Mickey Mouse", senator: "John Smith"}} />
	</Print>
        
        <NoPrint force>
          <div className="App">
            <header className="App-header">
              <img src="./vw-checkmark.png" className="App-logo" alt="logo" />
              <button onClick={this.print}>print ballot</button>
            </header>
          </div>
        </NoPrint>
      </PrintProvider>
    );
  }
}

export default App;
