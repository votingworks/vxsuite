package update

type OutputChunkList []any

func (self *OutputChunkList) Push(chunks ...any) *OutputChunkList {
	*self = append(*self, chunks...)
	return self
}
