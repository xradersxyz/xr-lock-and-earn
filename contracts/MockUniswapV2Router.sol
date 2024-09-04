// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router01.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockUniswapV2Router is IUniswapV2Router01 {
    address private _mockFactory;
    address private _mockWETH;

    mapping(address => uint256) private _balances;

    address public tokenA;
    address public tokenB;
    uint256 public tokenAPriceInTokenB;

    constructor(
        address _tokenA,
        address _tokenB,
        uint256 _price,
        address mockWETH,
        address mockFactory
    ) {
        tokenA = _tokenA;
        tokenB = _tokenB;
        tokenAPriceInTokenB = _price; // price of 1 tokenA in terms of tokenB
        _mockWETH = mockWETH;
        _mockFactory = mockFactory;
    }

    // Implement factory() function
    function factory() external pure override returns (address) {
        return address(0); // Mock address
    }

    // Implement WETH() function
    function WETH() external pure override returns (address) {
        return address(0); // Mock address
    }

    // Mock addLiquidity function
    function addLiquidity(
        address, /* tokenA */
        address, /* tokenB */
        uint amountADesired,
        uint amountBDesired,
        uint, /* amountAMin */
        uint, /* amountBMin */
        address to,
        uint /* deadline */
    ) external override returns (uint amountA, uint amountB, uint liquidity) {
        amountA = amountADesired;
        amountB = amountBDesired;
        liquidity = amountADesired; // Mock liquidity value
        IERC20(tokenA).transferFrom(msg.sender, to, amountA);
        IERC20(tokenB).transferFrom(msg.sender, to, amountB);
    }

    // Mock addLiquidityETH function
    function addLiquidityETH(
        address, /* token */
        uint amountTokenDesired,
        uint, /* amountTokenMin */
        uint, /* amountETHMin */
        address to,
        uint /* deadline */
    ) external payable override returns (uint amountToken, uint amountETH, uint liquidity) {
        amountToken = amountTokenDesired;
        amountETH = msg.value;
        liquidity = amountToken; // Mock liquidity value
        IERC20(tokenA).transferFrom(msg.sender, to, amountToken);
        payable(to).transfer(amountETH);
    }

    // Mock removeLiquidity function
    function removeLiquidity(
        address, /* tokenA */
        address, /* tokenB */
        uint liquidity,
        uint, /* amountAMin */
        uint, /* amountBMin */
        address to,
        uint /* deadline */
    ) external override returns (uint amountA, uint amountB) {
        amountA = liquidity; // Mock return
        amountB = liquidity; // Mock return
        IERC20(tokenA).transfer(to, amountA);
        IERC20(tokenB).transfer(to, amountB);
    }

    // Mock removeLiquidityETH function
    function removeLiquidityETH(
        address, /* token */
        uint liquidity,
        uint, /* amountTokenMin */
        uint, /* amountETHMin */
        address to,
        uint /* deadline */
    ) external override returns (uint amountToken, uint amountETH) {
        amountToken = liquidity; // Mock return
        amountETH = liquidity; // Mock return
        IERC20(tokenA).transfer(to, amountToken);
        payable(to).transfer(amountETH);
    }

    // Mock removeLiquidityWithPermit function
    function removeLiquidityWithPermit(
        address tokenA,
        address tokenB,
        uint liquidity,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline,
        bool approveMax,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external override returns (uint amountA, uint amountB) {
        amountA = liquidity;
        amountB = liquidity;
        IERC20(tokenA).transfer(to, amountA);
        IERC20(tokenB).transfer(to, amountB);
    }

    // Mock removeLiquidityETHWithPermit function
    function removeLiquidityETHWithPermit(
        address token,
        uint liquidity,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline,
        bool approveMax,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external override returns (uint amountToken, uint amountETH) {
        amountToken = liquidity;
        amountETH = liquidity;
        IERC20(token).transfer(to, amountToken);
        payable(to).transfer(amountETH);
    }

    // Mock swapExactTokensForTokens function
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external override returns (uint[] memory amounts) {
        amounts = getAmountsOut(amountIn, path);
        require(amounts[amounts.length - 1] >= amountOutMin, "Insufficient output amount");
        IERC20(path[0]).transferFrom(msg.sender, address(this), amounts[0]);
        IERC20(path[1]).transfer(to, amounts[amounts.length - 1]);
    }

    // Mock swapTokensForExactTokens function
    function swapTokensForExactTokens(
        uint amountOut,
        uint amountInMax,
        address[] calldata path,
        address to,
        uint deadline
    ) external override returns (uint[] memory amounts) {
        amounts = getAmountsIn(amountOut, path);
        require(amounts[0] <= amountInMax, "Excessive input amount");
        IERC20(path[0]).transferFrom(msg.sender, address(this), amounts[0]);
        IERC20(path[1]).transfer(to, amountOut);
    }

    // Mock swapExactETHForTokens function
    function swapExactETHForTokens(
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external payable override returns (uint[] memory amounts) {
        amounts = getAmountsOut(msg.value, path);
        require(amounts[amounts.length - 1] >= amountOutMin, "Insufficient output amount");
        IERC20(path[1]).transfer(to, amounts[amounts.length - 1]);
    }

    // Mock swapTokensForExactETH function
    function swapTokensForExactETH(
        uint amountOut,
        uint amountInMax,
        address[] calldata path,
        address to,
        uint deadline
    ) external override returns (uint[] memory amounts) {
        amounts = getAmountsIn(amountOut, path);
        require(amounts[0] <= amountInMax, "Excessive input amount");
        IERC20(path[0]).transferFrom(msg.sender, address(this), amounts[0]);
        payable(to).transfer(amountOut);
    }

    // Mock swapExactTokensForETH function
    function swapExactTokensForETH(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external override returns (uint[] memory amounts) {
        amounts = getAmountsOut(amountIn, path);
        require(amounts[amounts.length - 1] >= amountOutMin, "Insufficient output amount");
        IERC20(path[0]).transferFrom(msg.sender, address(this), amounts[0]);
        payable(to).transfer(amounts[amounts.length - 1]);
    }

    // Mock swapETHForExactTokens function
    function swapETHForExactTokens(
        uint amountOut,
        address[] calldata path,
        address to,
        uint deadline
    ) external payable override returns (uint[] memory amounts) {
        amounts = getAmountsIn(amountOut, path);
        require(amounts[0] <= msg.value, "Excessive input amount");
        IERC20(path[1]).transfer(to, amountOut);
    }

    // Mock quote function
    function quote(
        uint amountA,
        uint reserveA,
        uint reserveB
    ) external pure override returns (uint amountB) {
        require(amountA > 0, "UniswapV2Library: INSUFFICIENT_AMOUNT");
        require(reserveA > 0 && reserveB > 0, "UniswapV2Library: INSUFFICIENT_LIQUIDITY");
        amountB = (amountA * reserveB) / reserveA;
    }

    // Mock getAmountOut function
    function getAmountOut(
        uint amountIn,
        uint reserveIn,
        uint reserveOut
    ) external pure override returns (uint amountOut) {
        require(amountIn > 0, "UniswapV2Library: INSUFFICIENT_INPUT_AMOUNT");
        require(reserveIn > 0 && reserveOut > 0, "UniswapV2Library: INSUFFICIENT_LIQUIDITY");
        uint amountInWithFee = amountIn * 997;
        uint numerator = amountInWithFee * reserveOut;
        uint denominator = (reserveIn * 1000) + amountInWithFee;
        amountOut = numerator / denominator;
    }

    // Mock getAmountIn function
    function getAmountIn(
        uint amountOut,
        uint reserveIn,
        uint reserveOut
    ) external pure override returns (uint amountIn) {
        require(amountOut > 0, "UniswapV2Library: INSUFFICIENT_OUTPUT_AMOUNT");
        require(reserveIn > 0 && reserveOut > 0, "UniswapV2Library: INSUFFICIENT_LIQUIDITY");
        uint numerator = reserveIn * amountOut * 1000;
        uint denominator = (reserveOut - amountOut) * 997;
        amountIn = (numerator / denominator) + 1;
    }

    // Mock getAmountsOut function
    function getAmountsOut(uint amountIn, address[] memory path) public view override returns (uint[] memory amounts) {
        require(path.length >= 2, "UniswapV2Library: INVALID_PATH");
        amounts = new uint[](path.length);
        amounts[0] = amountIn;
        amounts[1] = (amountIn * tokenAPriceInTokenB) / 1e18; // Mock calculation for token price
    }

    // Mock getAmountsIn function
    function getAmountsIn(uint amountOut, address[] memory path) public view override returns (uint[] memory amounts) {
        require(path.length >= 2, "UniswapV2Library: INVALID_PATH");
        amounts = new uint[](path.length);
        amounts[0] = (amountOut * 1e18) / tokenAPriceInTokenB; // Mock calculation for token price
        amounts[1] = amountOut;
    }
}
