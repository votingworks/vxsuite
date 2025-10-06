use std::{fmt::Debug, mem::swap};

/// Represents a pair of two values of the same type. This type is useful for
/// doing similar things to what you might do with iterables, but optimized for
/// collections with exactly two elements such as ballot card pages.
pub struct Pair<T> {
    first: T,
    second: T,
}

impl<T> Pair<T> {
    /// Create a new `Pair` with the given first and second elements.
    ///
    /// # Examples
    ///
    /// ```
    /// use types_rs::pair::Pair;
    ///
    /// let pair = Pair::new(42, 99);
    /// assert_eq!(pair.first(), &42);
    /// assert_eq!(pair.second(), &99);
    /// ```
    pub const fn new(first: T, second: T) -> Self {
        Self { first, second }
    }

    /// Get a reference to the first element.
    ///
    /// # Examples
    ///
    /// ```
    /// use types_rs::pair::Pair;
    ///
    /// let pair = Pair::new(1, 2);
    /// assert_eq!(pair.first(), &1);
    /// ```
    pub const fn first(&self) -> &T {
        &self.first
    }

    /// Get a reference to the second element.
    ///
    /// # Examples
    ///
    /// ```
    /// use types_rs::pair::Pair;
    ///
    /// let pair = Pair::new(1, 2);
    /// assert_eq!(pair.second(), &2);
    /// ```
    pub const fn second(&self) -> &T {
        &self.second
    }

    /// Transform both elements of the pair using the given mapper function.
    ///
    /// # Examples
    ///
    /// ```
    /// use types_rs::pair::Pair;
    ///
    /// let pair = Pair::new(1, 2);
    /// let doubled = pair.map(|x| x * 2);
    /// assert_eq!(doubled.first(), &2);
    /// assert_eq!(doubled.second(), &4);
    /// ```
    pub fn map<U>(self, mapper: impl Fn(T) -> U) -> Pair<U> {
        Pair::new(mapper(self.first), mapper(self.second))
    }

    /// Combine this pair with another pair, creating pairs of tuples.
    ///
    /// # Examples
    ///
    /// ```
    /// use types_rs::pair::Pair;
    ///
    /// let numbers = Pair::new(1, 2);
    /// let letters = Pair::new('a', 'b');
    /// let combined = numbers.zip(letters);
    /// assert_eq!(combined.first(), &(1, 'a'));
    /// assert_eq!(combined.second(), &(2, 'b'));
    /// ```
    pub fn zip<U>(self, other: impl Into<Pair<U>>) -> Pair<(T, U)> {
        let other = other.into();
        Pair::new((self.first, other.first), (self.second, other.second))
    }

    /// Combine both elements of the pair using the given joiner function.
    ///
    /// # Examples
    ///
    /// ```
    /// use types_rs::pair::Pair;
    ///
    /// let pair = Pair::new(3, 5);
    /// let sum = pair.join(|a, b| a + b);
    /// assert_eq!(sum, 8);
    ///
    /// let pair = Pair::new("hello", "world");
    /// let combined = pair.join(|a, b| format!("{} {}", a, b));
    /// assert_eq!(combined, "hello world");
    /// ```
    pub fn join<U>(self, joiner: impl Fn(T, T) -> U) -> U {
        joiner(self.first, self.second)
    }

    /// Swap the first and second elements of this pair.
    ///
    /// # Examples
    ///
    /// ```
    /// use types_rs::pair::Pair;
    ///
    /// let mut pair = Pair::<u8>::new(3, 5);
    /// pair.swap();
    /// assert_eq!(pair, Pair::new(5, 3));
    /// ```
    pub fn swap(&mut self) {
        swap(&mut self.first, &mut self.second);
    }
}

impl<T> Pair<T>
where
    T: Send + Sync,
{
    /// Transform both elements of the pair in parallel using the given mapper function.
    pub fn par_map<U, F>(self, mapper: F) -> Pair<U>
    where
        U: Send,
        F: (Fn(T) -> U) + Send + Sync,
    {
        let (first, second) = self.into();
        rayon::join(|| mapper(first), || mapper(second)).into()
    }
}

impl<T> From<(T, T)> for Pair<T> {
    fn from(value: (T, T)) -> Self {
        Pair::new(value.0, value.1)
    }
}

impl<T> From<Pair<T>> for (T, T) {
    fn from(value: Pair<T>) -> Self {
        (value.first, value.second)
    }
}

impl<T, U> From<(Pair<T>, Pair<U>)> for Pair<(T, U)> {
    fn from(value: (Pair<T>, Pair<U>)) -> Self {
        Pair::new(
            (value.0.first, value.1.first),
            (value.0.second, value.1.second),
        )
    }
}

impl<T, U, V> From<(Pair<T>, Pair<U>, Pair<V>)> for Pair<(T, U, V)> {
    fn from(value: (Pair<T>, Pair<U>, Pair<V>)) -> Self {
        Pair::new(
            (value.0.first, value.1.first, value.2.first),
            (value.0.second, value.1.second, value.2.second),
        )
    }
}

impl<T, U, V, W> From<(Pair<T>, Pair<U>, Pair<V>, Pair<W>)> for Pair<(T, U, V, W)> {
    fn from(value: (Pair<T>, Pair<U>, Pair<V>, Pair<W>)) -> Self {
        Pair::new(
            (value.0.first, value.1.first, value.2.first, value.3.first),
            (
                value.0.second,
                value.1.second,
                value.2.second,
                value.3.second,
            ),
        )
    }
}

impl<T, U, V, W, X> From<(Pair<T>, Pair<U>, Pair<V>, Pair<W>, Pair<X>)> for Pair<(T, U, V, W, X)> {
    fn from(value: (Pair<T>, Pair<U>, Pair<V>, Pair<W>, Pair<X>)) -> Self {
        Pair::new(
            (
                value.0.first,
                value.1.first,
                value.2.first,
                value.3.first,
                value.4.first,
            ),
            (
                value.0.second,
                value.1.second,
                value.2.second,
                value.3.second,
                value.4.second,
            ),
        )
    }
}

impl<T, U, V, W, X, Y> From<(Pair<T>, Pair<U>, Pair<V>, Pair<W>, Pair<X>, Pair<Y>)>
    for Pair<(T, U, V, W, X, Y)>
{
    fn from(value: (Pair<T>, Pair<U>, Pair<V>, Pair<W>, Pair<X>, Pair<Y>)) -> Self {
        Pair::new(
            (
                value.0.first,
                value.1.first,
                value.2.first,
                value.3.first,
                value.4.first,
                value.5.first,
            ),
            (
                value.0.second,
                value.1.second,
                value.2.second,
                value.3.second,
                value.4.second,
                value.5.second,
            ),
        )
    }
}

impl<T, U, V, W, X, Y, Z>
    From<(
        Pair<T>,
        Pair<U>,
        Pair<V>,
        Pair<W>,
        Pair<X>,
        Pair<Y>,
        Pair<Z>,
    )> for Pair<(T, U, V, W, X, Y, Z)>
{
    fn from(
        value: (
            Pair<T>,
            Pair<U>,
            Pair<V>,
            Pair<W>,
            Pair<X>,
            Pair<Y>,
            Pair<Z>,
        ),
    ) -> Self {
        Pair::new(
            (
                value.0.first,
                value.1.first,
                value.2.first,
                value.3.first,
                value.4.first,
                value.5.first,
                value.6.first,
            ),
            (
                value.0.second,
                value.1.second,
                value.2.second,
                value.3.second,
                value.4.second,
                value.5.second,
                value.6.second,
            ),
        )
    }
}

impl<'a, T> From<&'a Pair<T>> for Pair<&'a T> {
    fn from(value: &'a Pair<T>) -> Self {
        (&value.first, &value.second).into()
    }
}

impl<'a, T> From<&'a mut Pair<T>> for Pair<&'a mut T> {
    fn from(value: &'a mut Pair<T>) -> Self {
        (&mut value.first, &mut value.second).into()
    }
}

impl<T> Debug for Pair<T>
where
    T: Debug,
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Pair({:?}, {:?})", self.first, self.second)
    }
}

impl<T> PartialEq for Pair<T>
where
    T: PartialEq,
{
    fn eq(&self, other: &Self) -> bool {
        self.first == other.first && self.second == other.second
    }
}

impl<T, E> Pair<Result<T, E>> {
    /// Convert a `Pair<Result<T, E>>` into a `Result<Pair<T>, E>`.
    ///
    /// # Errors
    ///
    /// Returns an error if either of the pair's results is an error.
    pub fn into_result(self: Pair<Result<T, E>>) -> Result<Pair<T>, E> {
        let (first, second) = self.into();
        Ok(Pair::new(first?, second?))
    }
}

impl<T> Default for Pair<T>
where
    T: Default,
{
    fn default() -> Self {
        (T::default(), T::default()).into()
    }
}
