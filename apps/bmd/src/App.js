import React, { Component, button } from 'react';
import PrintProvider, { Print, NoPrint } from 'react-easy-print';
import './App.css';

import { withStyles } from '@material-ui/core/styles';
import Radio from '@material-ui/core/Radio';
import RadioGroup from '@material-ui/core/RadioGroup';
import FormHelperText from '@material-ui/core/FormHelperText';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import FormControl from '@material-ui/core/FormControl';
import FormLabel from '@material-ui/core/FormLabel';


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

const styles = theme => ({
  root: {
    display: 'flex',
  },
  formControl: {
    margin: theme.spacing.unit * 3,
  },
  group: {
    margin: `${theme.spacing.unit}px 0`,
  },
});


class BallotContest extends React.Component {
  handleChange = event => {
    this.setState({ value: event.target.value });
  };

  constructor(props) {
    super(props);
    this.contest = props.contest;
    this.state = {value: null};
  }
  
  render() {
    let contest = this.contest;

    let rows = []

    // Outer loop to create parent
    for (let option of contest.options) {
      rows.push(
        <FormControlLabel
          value={option}
          label={option}
          control={<Radio />}
          labelPlacement="end"
        />
      );
    }

    return (
      <FormControl component="fieldset">
        <FormLabel component="legend">{contest.name}</FormLabel>
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
    this.election = props.election
  }

  render() {
    let election = this.election;
    return (
      <div>
        <h1>Ballot</h1>
        <BallotContest contest={election.contests[0]} />
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
          <PrintableBallot election={ELECTION} ballot={{president: "Mickey Mouse", senator: "John Smith"}} />
	</Print>
        
        <NoPrint force>
          <div className="App">
            <img src="./vw-checkmark.png" className="App-logo" alt="logo" />
            <Ballot election={ELECTION} />
            <button onClick={this.print}>print ballot</button>
          </div>
        </NoPrint>
      </PrintProvider>
    );
  }
}

export default App;
