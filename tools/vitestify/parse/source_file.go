package parse

import (
	"context"
	"log"
	"path"

	sitter "github.com/smacker/go-tree-sitter"
	"github.com/smacker/go-tree-sitter/typescript/tsx"
	"github.com/smacker/go-tree-sitter/typescript/typescript"
)

var (
	LangTs  = typescript.GetLanguage()
	LangTsx = tsx.GetLanguage()
)

type Src struct {
	code []byte
	file *File
	lang *sitter.Language
	tree *sitter.Tree
}

func (self *Src) Dispose() {
	self.tree.Close()
}

func (self Src) Code() []byte {
	return self.code
}

func (self Src) Lang() *sitter.Language {
	return self.lang
}

func (self Src) File() *File {
	return self.file
}

func (self Src) RootNode() *sitter.Node {
	return self.tree.RootNode()
}

func (self Src) NewReader() *Reader {
	return &Reader{
		file: &self,
		pos:  0,
	}
}

func ParseSrc(file *File, code []byte) (*Src, error) {
	var tree *sitter.Tree
	var err error

	lang := file.Lang()
	parser := createParser(lang)
	defer parser.Close()

	tree, err = parser.ParseCtx(context.Background(), nil, code)
	if err != nil {
		return nil, err
	}

	return &Src{
		code: code,
		file: file,
		lang: lang,
		tree: tree,
	}, nil
}

type File struct {
	lang     *sitter.Language
	rootPath string
}

func NewFile(rootPath string) *File {
	var lang *sitter.Language

	extension := path.Ext(rootPath)
	switch extension {
	case ".ts":
		lang = LangTs
	case ".tsx":
		lang = LangTsx
	case "":
		log.Fatalf("missing file extension for %s\n", rootPath)
	default:
		log.Fatalf("invalid source file type: %s\n", rootPath)
	}

	return &File{
		lang:     lang,
		rootPath: rootPath,
	}
}

func (self File) RootPath() string {
	return self.rootPath
}

func (self File) Lang() *sitter.Language {
	return self.lang
}

func (self File) String() string {
	return self.rootPath
}

func createParser(language *sitter.Language) *sitter.Parser {
	parser := sitter.NewParser()
	parser.SetLanguage(language)
	return parser
}
