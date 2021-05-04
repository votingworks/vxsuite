import styled from 'styled-components'

export const TopLeftContent = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  margin: 0.5rem 0.75rem;
`

export const TopRightContent = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  margin: 0.5rem 0.75rem;
`

export const BottomRightContent = styled.div`
  position: absolute;
  right: 0;
  bottom: 0;
  margin: 0.5rem 0.75rem;
`

export const BottomBar = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  position: absolute;
  bottom: 0;
  left: 0;
  background: #455a64;
  width: 100%;
  padding: 0.5rem 0.75rem;
  color: #ffffff;
`
