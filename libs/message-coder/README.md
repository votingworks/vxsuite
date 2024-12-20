# `message-coder`

Provides a simple way to encode and decode binary messages from/to JavaScript
objects.

## Usage

```ts
import {
  CoderType,
  fixedString,
  literal,
  message,
  uint8,
} from '@votingworks/message-coder';

enum Genre {
  Blues = 0x00,
  ClassicRock = 0x01,
  Country = 0x02,
  Dance = 0x03,
  Disco = 0x04,
  Funk = 0x05,
  Grunge = 0x06,
  HipHop = 0x07,
  Jazz = 0x08,
  // ...
}

// define a coder for ID3v1 tags
const Id3v1 = message({
  header: literal('TAG'),
  title: fixedString(30),
  artist: fixedString(30),
  album: fixedString(30),
  year: fixedString(4),
  comment: fixedString(28),
  zeroByte: literal(0x00),
  track: uint8(),
  genre: uint8<Genre>(Genre),
});
type Id3v1 = CoderType<typeof Id3v1>;

// encode a tag
const tag: Id3v1 = {
  title: 'The Title',
  artist: 'The Artist',
  album: 'The Album',
  year: '2000',
  comment: 'The Comment',
  track: 1,
  genre: 2,
};

console.log('Tag:', tag);
console.log('Encoded:', Id3v1.encode(tag));

// open an mp3 file and read the last 128 bytes,
// then decode it as an ID3v1 tag
const file = fs.readFileSync('song.mp3');
const tagBytes = file.slice(file.length - 128);
console.log('Decoded from song.mp3:', Id3v1.decode(tagBytes));
```
