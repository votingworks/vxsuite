package parse

import "fmt"

type Reader struct {
	file *Src
	pos  int
}

func NewReader(file *Src) *Reader {
	return &Reader{
		pos:  0,
		file: file,
	}
}

func (self *Reader) ReadToEnd() (string, error) {
	if self.pos >= len(self.file.code) {
		return "", nil
	}

	return self.ReadTo(len(self.file.code))
}

func (self *Reader) ReadTo(newPos int) (string, error) {
	if self.pos >= len(self.file.code) {
		return "", fmt.Errorf(
			"attempted to read past end of file %s",
			self.file.file,
		)
	}

	if newPos == self.pos {
		return "", nil
	}

	oldPos := self.pos
	if err := self.Seek(newPos); err != nil {
		return "", err
	}

	return string(self.file.code[oldPos:newPos]), nil
}

func (self *Reader) MaybeConsumeTrailingNewline() {
	if self.pos >= len(self.file.code) {
		return
	}

	if self.file.code[self.pos] == '\n' {
		self.Seek(self.pos + 1)
	}
}

func (self *Reader) Seek(newPos int) error {
	if newPos > len(self.file.code) {
		return fmt.Errorf(
			"attempted to seek past end of file to %d for file %s",
			self.pos,
			self.file.file,
		)
	}

	self.pos = newPos
	return nil
}
