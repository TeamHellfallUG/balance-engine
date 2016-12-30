const uniquify = function(listOfLists){

    if(!Array.isArray(listOfLists)){
        return [];
    }

    const sum = {};

    let i = -1;
    let j = -1;
    for(i = 0; i < listOfLists.length; i++){

        if(!Array.isArray(listOfLists[i])){
            continue;
        }

        for(j = 0; j < listOfLists[i].length; j++){
            sum[listOfLists[i][j]] = true;
        }
    }

    return Object.keys(sum);
};

module.exports = uniquify;