import React, { Component } from 'react';
import PrintProvider, { Print, NoPrint } from 'react-easy-print';
import './App.css';

import Radio from '@material-ui/core/Radio';
import RadioGroup from '@material-ui/core/RadioGroup';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import FormControl from '@material-ui/core/FormControl';
import FormLabel from '@material-ui/core/FormLabel';
import Typography from '@material-ui/core/Typography';
import Button from '@material-ui/core/Button';


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

class BallotContest extends React.Component {
  handleChange = event => {
    let value = event.target.value;
    this.setState({ value: value });
    this.choices[this.contest.id] = value;
  };

  constructor(props) {
    super(props);
    this.contest = props.contest;
    this.choices = props.choices;
    this.state = {value: this.choices[this.contest.id]};
  }
  
  render() {
    let contest = this.contest;

    let rows = [];
    
    // Outer loop to create parent
    contest.options.forEach((option, i) => {
      rows.push(
        <FormControlLabel
          value={""+i}
          label={<Typography style={{fontSize: "2em"}}>{option}</Typography>}
          control={<Radio />}
          labelPlacement="end"
          key={i}
          style={{margin: "10px", padding: "20px", border: "1px solid #ddd"}}
        />
      );
    });

    return (
      <FormControl component="fieldset">
        <FormLabel component="legend" style={{fontSize: "2.5em", padding: "20px"}}>{contest.name}</FormLabel>
        <RadioGroup
          aria-label={contest.id}
          name={contest.id}
          value={this.state.value}
          onChange={this.handleChange}
        >
        {rows}
        </RadioGroup>
      </FormControl>
    );      
    
  }
}

class Ballot extends Component {
  constructor(props) {
    super(props);
    this.election = props.election;
    this.ballotready = props.onBallotReady;
    this.state = {position: 0, choices: {}};
  }

  next() {
    if (this.state.position+1 >= this.election.contests.length) {
      this.ballotready(this.state.choices);
    } else {
      this.setState({position: this.state.position+1, choices: this.state.choices});
    }
  }

  previous() {
    this.setState({position: this.state.position-1, choices: this.state.choices});   }

  print() {
    this.ballotready(this.state.choices);
  }
  
  render() {
    let election = this.election;
    
    let buttons = [];
    if (this.state.position > 0) {
      buttons.push(
        <Button key="previous" size="large" variant="contained" onClick={()=>{this.previous();}} style={{margin: "20px", padding: "20px"}}>Previous</Button>
      );
    }

    buttons.push(
      <Button key="next" size="large" variant="contained" onClick={()=>{this.next();}} style={{margin: "20px", padding: "20px"}}>Next</Button>
    );

    return (
      <div>
        <h1>{election.title}</h1>
        <div>
          <BallotContest
            key={this.state.position}
            contest={this.election.contests[this.state.position]}
            choices={this.state.choices}
          />
        </div>
      <div style={{padding: "20px"}}>
          {buttons}
        </div>      
      </div>
    );
  }
}

class PrintableBallot extends Component {
  constructor(props) {
    super(props);
    this.state = {election: props.election, ballot: props.ballot}
  }
  
  render() {
    let rows = []

    // Outer loop to create parent
    for (let contest of this.state.election.contests) {
      rows.push(<tr key={contest.id}><th align="left" width="30%">{contest.name}</th><td>{contest.options[this.state.ballot[contest.id]]}</td></tr>);
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
  constructor(props) {
    super(props);
    this.state = {};
  }
  
  ballotReady(ballot) {
    this.setState({ballot: ballot});
  }

  print() {
    window.print();
  }

  render() {
    let mainContent, printableBallot;
    if (this.state.ballot) {
      printableBallot = (
        <PrintableBallot election={ELECTION} ballot={this.state.ballot} />
      );
      
      mainContent = (
        <div>
          <div style={{paddingLeft: "400px", paddingRight: "400px", paddingBottom: "50px"}}>{printableBallot}</div>
          <button onClick={this.print.bind(this)} style={{fontSize: "2.5em"}}>Print</button>
        </div>
        
      );
    } else {
      printableBallot = (<div></div>);
      mainContent = (
        <Ballot election={ELECTION} onBallotReady={this.ballotReady.bind(this)} />
      );
    }

    
    return (
      <PrintProvider>
        <Print single printOnly name="ballot">
          {printableBallot}
        </Print>

        <NoPrint force>
          <div className="App">
            <img src="./vw-checkmark.png" className="App-logo" alt="logo" />
            {mainContent}
          </div>
      </NoPrint>
      </PrintProvider>
    );
  }
}

export default App;
