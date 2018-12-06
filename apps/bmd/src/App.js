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
    let value = parseInt(event.target.value);
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

    let rows = []

    // Outer loop to create parent
    contest.options.forEach((option, i) => {
      rows.push(
        <FormControlLabel
          value={i}
          label={<Typography style={{fontSize: "2em"}}>{option}</Typography>}
          control={<Radio />}
          labelPlacement="end"
        />
      );
    });

    return (
      <FormControl component="fieldset">
        <FormLabel component="legend"><h2>{contest.name}</h2></FormLabel>
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
      this.setState({review: true, choices: this.state.choices});
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

    if (this.state.review) {
      return (
        <div align="center">
          <h1>Review</h1>
          <button onClick={this.print.bind(this)} style={{fontSize: "2.5em"}}>Print</button>
        </div>
      );
    }
    
    let buttons = [];
    if (this.state.position > 0) {
      buttons.push(
        <Button onClick={()=>{this.previous();}}>Previous</Button>
      );
    }

    buttons.push(
      <Button onClick={()=>{this.next();}}>Next</Button>
    );

    return (
      <div>
        <h1>{election.title}</h1>
        <p>
          <BallotContest
            key={this.state.position}
            contest={this.election.contests[this.state.position]}
            choices={this.state.choices}
          />
        </p>
        {buttons}
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
    window.requestAnimationFrame(function() {
      window.print();
    });
  }

  render() {
    let printableBallot;
    if (this.state.ballot) {
      printableBallot = (
        <PrintableBallot election={ELECTION} ballot={this.state.ballot} />
      );
    } else {
      printableBallot = (<div></div>);
    }
    
    return (
      <PrintProvider>
	<Print single printOnly name="ballot">
          {printableBallot}
	</Print>
        
        <NoPrint force>
          <div className="App">
            <img src="./vw-checkmark.png" className="App-logo" alt="logo" />
            <Ballot election={ELECTION} onBallotReady={this.ballotReady.bind(this)} />
          </div>
        </NoPrint>
      </PrintProvider>
    );
  }
}

export default App;
